# ---------------------------------------------------------------------------
# FSW: direct-Firestore writes and queries for every toolset operation.
#
# The toolsets call Firestore's REST API, which only accepts typed documents
# ({"fields": {"amount": {"doubleValue": 100}}}), a documentId query parameter on create,
# an updateMask on update (without one a PATCH REPLACES the whole document) and a
# structuredQuery for runQuery. The model sends plain arguments, so every write failed
# with 400 "Unknown name ...". This builds the real request from the plain arguments, and:
#   * allows only the fields the spec declares (no mass assignment)
#   * forces customerId (body field and path parameter) to the session's customer
#   * validates required fields and path ids (no '/' or '..')
#   * makes a patch fail on a missing document instead of creating one
#   * derives a deterministic documentId for creates, so a retry is a 409, not a duplicate
#   * requires step-up (L3) for payee / profile / FX changes
# The registry below is GENERATED from the toolset specs (scripts/gen_firestore_writes.py).
# ---------------------------------------------------------------------------
_FSW_REGISTRY = json.loads('''__REGISTRY_JSON__''')
_FSW_BY_NAME = {}
_FSW_RESERVED = {'fields', 'documentId', 'updateMask.fieldPaths', 'currentDocument.exists', 'structuredQuery'}
_FSW_STEPUP_REASON = {'addPayee': 'new_payee', 'updatePayee': 'payee_edit', 'deletePayee': 'payee_edit',
                      'updateProfile': 'contact_change', 'createFXOrder': 'wire', 'createFXDraft': 'wire'}
_FSW_CUSTOMER_FIELD = {'phone': 'registered_mobile', 'email': 'email',
                       'account_number': 'account_number', 'caller_id': 'telephony_caller_id'}
_FSW_DOC_ROOT = 'projects/emvnzir-canada-song/databases/acn-bank-fs-db/documents'

def _fsw_build_index():
    counts = {}
    for _c in _FSW_REGISTRY.values():
        counts[_c['op']] = counts.get(_c['op'], 0) + 1
    for _k, _c in _FSW_REGISTRY.items():
        _FSW_BY_NAME[_k] = _c
        if counts[_c['op']] == 1:
            _FSW_BY_NAME[_c['op']] = _c
_fsw_build_index()

def _fsw_value(v):
    """Python value -> Firestore REST typed value."""
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {str(k): _fsw_value(x) for k, x in v.items()}}}
    if isinstance(v, (list, tuple)):
        return {"arrayValue": {"values": [_fsw_value(x) for x in v]}}
    return {"stringValue": str(v)}

def _fsw_safe_id(v) -> str:
    s = str(v if v is not None else '').strip()
    if not s or len(s) > 128 or '..' in s or s in ('.', '..'):
        return ''
    return s if all(ch.isalnum() or ch in '-_.' for ch in s) else ''

def _fsw_now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def _fsw_query(cfg, customer_id, plain):
    op = cfg['op']
    filters = []
    limit = 50
    if op == 'queryCustomers':
        field = _FSW_CUSTOMER_FIELD.get(str(plain.get('identifierType', '')).strip().lower())
        value = plain.get('identifierValue')
        if not field or value in (None, ''):
            return None, {"error": "MISSING_FIELD", "message": "identifierType (phone | email | account_number | caller_id) and identifierValue are required."}
        filters.append((field, str(value)))
        # only ever the session's own customer record, whatever identifier was supplied
        sq_ref = _FSW_DOC_ROOT + '/customers/' + customer_id
    else:
        sq_ref = None
        for k in cfg['allow']:
            if k in ('q', 'limit'):
                continue
            if plain.get(k) not in (None, ''):
                filters.append((k, plain[k]))
        if cfg.get('cust_field'):
            filters = [f for f in filters if f[0] != 'customerId'] + [('customerId', customer_id)]
        try:
            if plain.get('limit') not in (None, ''):
                limit = max(1, min(int(float(plain['limit'])), 50))
        except (ValueError, TypeError):
            pass
    parts = [{"fieldFilter": {"field": {"fieldPath": f}, "op": "EQUAL", "value": _fsw_value(v)}} for f, v in filters]
    if sq_ref:
        parts.append({"fieldFilter": {"field": {"fieldPath": "__name__"}, "op": "EQUAL", "value": {"referenceValue": sq_ref}}})
    sq = {"from": [{"collectionId": cfg['col']}], "limit": limit}
    if len(parts) == 1:
        sq["where"] = parts[0]
    elif parts:
        sq["where"] = {"compositeFilter": {"op": "AND", "filters": parts}}
    return sq, None

def _fsw_clean_new_customer(data):
    """A new applicant's details: normalise the phone, keep only the last four SIN digits, refuse nonsense. Returns an error dict or None."""
    import re as _re
    digits = ''.join(ch for ch in str(data.get('registered_mobile', '')) if ch.isdigit())
    if len(digits) == 11 and digits.startswith('1'):
        digits = digits[1:]
    if len(digits) != 10:
        return {"error": "INVALID_FIELD", "message": "registered_mobile must be a 10-digit Canadian phone number."}
    data['registered_mobile'] = '+1' + digits
    dob = str(data.get('date_of_birth', '')).strip()
    if not _re.match(r'^\d{4}-\d{2}-\d{2}$', dob):
        return {"error": "INVALID_FIELD", "message": "date_of_birth must be written YYYY-MM-DD."}
    try:
        born = datetime.strptime(dob, '%Y-%m-%d')
        today = datetime.now(timezone.utc)
        age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    except ValueError:
        return {"error": "INVALID_FIELD", "message": "date_of_birth is not a real date."}
    if age < 16 or age > 120:
        return {"error": "NOT_ELIGIBLE", "message": "Applicants must be at least 16 years old (18 for most accounts)."}
    if not _re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', str(data.get('email', '')).strip()):
        return {"error": "INVALID_FIELD", "message": "email does not look like an email address."}
    if 'sin_last_four' in data:
        last4 = ''.join(ch for ch in str(data['sin_last_four']) if ch.isdigit())[-4:]
        if last4:
            data['sin_last_four'] = last4
            data['sin_provided'] = True
        else:
            data.pop('sin_last_four')
    data.setdefault('sin_provided', False)
    return None

def _fsw_prepare(cfg, state, input_dict, auth_level) -> Optional[dict]:
    """Validate and rewrite a toolset write/query call in place. Returns an error dict to block it."""
    customer_id = str(state.get("customer_id", "") or "")
    applicant = cfg.get('applicant')
    if not customer_id and applicant:
        customer_id = str(state.get("applicant_id", "") or "")     # a new applicant: the id saved by createNewCustomer
    public_query = cfg['kind'] == 'query' and not cfg.get('cust_field') and cfg['op'] != 'queryCustomers'
    if not customer_id and not public_query and applicant != 'new':
        return {"error": "AUTH_LEVEL_INSUFFICIENT", "message": "Please identify yourself first."}
    if cfg['stepup'] and auth_level < 3:
        reason = _FSW_STEPUP_REASON.get(cfg['op'], 'threshold')
        _set_auth(state, step_up_required=True, step_up_reason=reason)
        return {"error": "STEP_UP_REQUIRED",
                "message": "Additional verification required before this change: " + reason + ".",
                "step_up_reason": reason}
    nested = input_dict.get('fields') if isinstance(input_dict.get('fields'), dict) else {}
    _sq_in = input_dict.get('structuredQuery')
    if isinstance(_sq_in, dict) and 'from' not in _sq_in:
        nested = dict(_sq_in, **nested)   # the model put its plain filters inside structuredQuery
    path_vals = {}
    for pp in cfg['path']:
        if pp == 'customerId':
            path_vals[pp] = customer_id
            continue
        sid = _fsw_safe_id(input_dict.get(pp) if input_dict.get(pp) not in (None, '') else nested.get(pp))
        if not sid:
            return {"error": "MISSING_FIELD", "message": pp + " is required (letters, digits, - _ . only)."}
        path_vals[pp] = sid
    plain = dict(nested)
    for k, v in input_dict.items():
        if k not in _FSW_RESERVED and k not in cfg['path']:
            plain.setdefault(k, v)
    kind = cfg['kind']
    if kind == 'delete':
        input_dict.clear()
        input_dict.update(path_vals)
        return None
    if kind == 'query':
        sq, err = _fsw_query(cfg, customer_id, plain)
        if err:
            return err
        input_dict.clear()
        input_dict['structuredQuery'] = sq
        return None
    data = {k: plain[k] for k in cfg['allow'] if k in plain and plain[k] is not None and plain[k] != ''}
    if cfg['op'] == 'createNewCustomer':
        _bad = _fsw_clean_new_customer(data)
        if _bad:
            return _bad
    if cfg.get('cust_field'):
        data['customerId'] = customer_id
    missing = [r for r in cfg['required'] if r not in data]
    if missing:
        return {"error": "MISSING_FIELD", "message": "Missing required field(s): " + ", ".join(missing) + "."}
    data.update(cfg.get('set') or {})
    changed = [k for k in data if k != 'customerId']
    if kind == 'patch' and not changed:
        return {"error": "NOTHING_TO_UPDATE", "message": "Provide at least one of: " + ", ".join(cfg['allow']) + "."}
    data['createdAt' if kind == 'create' else 'updatedAt'] = _fsw_now()
    input_dict.clear()
    input_dict.update(path_vals)
    if kind == 'create':
        bucket = str(int(datetime.now(timezone.utc).timestamp()) // 600)
        seed = "|".join([cfg['op'], customer_id, json.dumps({k: v for k, v in data.items() if k != 'createdAt'}, sort_keys=True, default=str), bucket])
        prefix = (cfg['op'][6:] if cfg['op'].startswith('create') else cfg['op']).upper()[:14]
        input_dict['documentId'] = prefix + "-" + hashlib.sha256(seed.encode()).hexdigest()[:16].upper()
    else:
        input_dict['updateMask.fieldPaths'] = list(data.keys())
        input_dict['currentDocument.exists'] = True
    input_dict['fields'] = {k: _fsw_value(v) for k, v in data.items()}
    return None

