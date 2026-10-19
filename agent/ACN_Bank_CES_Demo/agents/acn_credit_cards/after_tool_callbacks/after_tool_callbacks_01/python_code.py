# NOTE: pruned to the subset reachable from this file's entrypoint.
# CES uploads each callback as a standalone python_code string (no shared
# imports), so the full module was duplicated into all 155 files. Regenerate
# with scripts/prune_callbacks.py after editing the canonical module.
# NOTE: pruned to the subset reachable from this file's entrypoint.
# CES uploads each callback as a standalone python_code string (no shared
# imports), so the full module was duplicated into all 155 files. Regenerate
# with scripts/prune_callbacks.py after editing the canonical module.
# NOTE: pruned to the subset reachable from this file's entrypoint.
# CES uploads each callback as a standalone python_code string (no shared
# imports), so the full module was duplicated into all 155 files. Regenerate
# with scripts/prune_callbacks.py after editing the canonical module.
"""
ACN Bank CES Demo — Shared Callback Module
All GECX callbacks delegate here. Platform globals (CallbackContext, Content, Part,
LlmResponse, LlmRequest, Tool) are auto-provided at runtime — do NOT import them.
Everything else MUST be explicitly imported.
"""

import re

import json

import logging

from datetime import datetime, timezone

from typing import Any, Optional

logger = logging.getLogger(__name__)

# Widget (presentation) tools.
#
# A widgetTool call is not a data fetch: the arguments the model supplies ARE
# the payload the client renders. _normalize_response() below is built for
# backend data tools and rewraps every response as {status, code, data}. Put a
# widget payload through it and the platform no longer recognises it as a
# widget -- the tool fires, nothing renders, and nothing errors.
WIDGET_TOOLS = frozenset({
    'acn-amount-input', 'acn-credit-card-widget', 'acn-form-input',
    'acn-insight-card', 'acn-nudge-card', 'acn-product-cards', 'acn-payee-selector',
    'acn-payment-carousel', 'acn-payment-receipt', 'card_carousel',
    'card_widget', 'epp_carousel', 'epp_plans', 'loan_preapproval',
    'mobile_handoff', 'mortgage_affordability', 'mortgage_calculator',
    'mortgage_kyc', 'mortgage_nudge', 'mortgage_rate_shelf',
    'mortgage_rate_table', 'qr_widget',
    'quick_actions',
})

# ── JSON group helpers ──────────────────────────────────────────────────────
def _auth(state):  return json.loads(state.get("auth_state",          "{}") or "{}")

def _cust(state):  return json.loads(state.get("customer_profile",    "{}") or "{}")

def _txn(state):   return json.loads(state.get("transaction_context", "{}") or "{}")

def _cnt(state):   return json.loads(state.get("session_counters",    "{}") or "{}")

def _set_auth(state, **kw): a=_auth(state); a.update(kw); state["auth_state"]          = json.dumps(a)

def _set_cust(state, **kw): c=_cust(state); c.update(kw); state["customer_profile"]   = json.dumps(c)

def _set_txn(state,  **kw): t=_txn(state);  t.update(kw); state["transaction_context"]= json.dumps(t)

def _set_cnt(state,  **kw): c=_cnt(state);  c.update(kw); state["session_counters"]   = json.dumps(c)

# ---------------------------------------------------------------------------
# AT: after_tool_callback
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# FSW results: Firestore answers with raw typed documents. Hand the model plain values, and make
# a duplicate create (409) a clear answer. Operation kinds are GENERATED from the toolset specs.
# ---------------------------------------------------------------------------
_FSW_KINDS = json.loads('''{"account_opening_db_createAccountApplication":"create","account_opening_db_updateAccountApplication":"patch","addPayee":"create","appointments_db_cancelAppointment":"delete","appointments_db_createAppointment":"create","appointments_db_updateAppointment":"patch","cancelAppointment":"delete","cancelPAD":"patch","cancelRecurringSchedule":"delete","card_applications_createApplication":"create","card_applications_persistApprovedCreditCardApplication":"create","card_applications_queryApplications":"query","card_applications_updateApplication":"patch","cheque_services_db_createBankDraft":"create","cheque_services_db_createChequeBookOrder":"create","cheque_services_db_createStopPayment":"create","createAccountApplication":"create","createActivationRequest":"create","createApplication":"create","createAppointment":"create","createBankDraft":"create","createChequeBookOrder":"create","createDispute":"create","createFXDraft":"create","createFXOrder":"create","createKycRequest":"create","createLoanApplication":"create","createNSFReversal":"create","createRecurringSchedule":"create","createRedemption":"create","createStopPayment":"create","customer_intelligence_db_logNudgeShown":"create","deletePayee":"delete","digital_activation_db_createActivationRequest":"create","digital_activation_db_updateActivationRequest":"patch","disputes_db_createDispute":"create","disputes_db_createPADDispute":"create","disputes_db_updateDispute":"patch","executeACNBankApplicationEmail":"create","faq_knowledge_db_searchFAQs":"query","fx_db_createFXDraft":"create","fx_db_createFXOrder":"create","kyc_request_tracking_createKycRequest":"create","kyc_request_tracking_writeKycRecord":"patch","listRecurringSchedules":"query","loan_applications_createLoanApplication":"create","loan_applications_queryLoanApplications":"query","loan_applications_updateLoanApplication":"patch","logNudgeShown":"create","manageCustomerDatabase_queryCustomers":"query","new_transaction_api_db_cancelRecurringSchedule":"delete","new_transaction_api_db_createRecurringSchedule":"create","new_transaction_api_db_listRecurringSchedules":"query","new_transaction_api_db_updateRecurringSchedule":"patch","new_transaction_api_db_updateTransaction":"patch","overdraft_pad_db_cancelPAD":"patch","overdraft_pad_db_createNSFReversal":"create","overdraft_pad_db_createPADDispute":"create","overdraft_pad_db_updateOverdraftProtection":"patch","patchCreditCardApplication":"patch","persist_approved_credit_card_patchCreditCardApplication":"patch","persist_approved_credit_card_persistApprovedCreditCardApplication":"create","preferences_db_updateMarketingConsent":"patch","preferences_db_updateNotificationPreferences":"patch","preferences_db_updatePaperlessEnrollment":"patch","queryApplications":"query","queryCustomers":"query","queryLoanApplications":"query","rewards_loyalty_db_createRedemption":"create","searchFAQs":"query","send_application_email_executeACNBankApplicationEmail":"create","updateAccount":"patch","updateAccountApplication":"patch","updateActivationRequest":"patch","updateApplication":"patch","updateAppointment":"patch","updateBill":"patch","updateCard":"patch","updateDispute":"patch","updateKycRecord":"patch","updateLoanApplication":"patch","updateMarketingConsent":"patch","updateNotificationPreferences":"patch","updatePaperlessEnrollment":"patch","updatePayee":"patch","updateProfile":"patch","updateRecurringSchedule":"patch","updateTransaction":"patch","update_customer_api_db_addPayee":"create","update_customer_api_db_deletePayee":"delete","update_customer_api_db_updateAccount":"patch","update_customer_api_db_updateBill":"patch","update_customer_api_db_updateCard":"patch","update_customer_api_db_updateOverdraftProtection":"patch","update_customer_api_db_updatePayee":"patch","update_customer_api_db_updateProfile":"patch","writeKycRecord":"patch","writeKycToDb":"create","write_kyc_to_db_updateKycRecord":"patch","write_kyc_to_db_writeKycToDb":"create"}''')

def _fsw_plain_value(v):
    if not isinstance(v, dict) or not v:
        return None
    k = next(iter(v))
    x = v[k]
    if k == 'integerValue':
        try:
            return int(x)
        except (ValueError, TypeError):
            return x
    if k == 'mapValue':
        return {a: _fsw_plain_value(b) for a, b in (x or {}).get('fields', {}).items()}
    if k == 'arrayValue':
        return [_fsw_plain_value(b) for b in (x or {}).get('values', [])]
    if k == 'nullValue':
        return None
    return x

def _fsw_doc(doc):
    out = {a: _fsw_plain_value(b) for a, b in (doc.get('fields') or {}).items()}
    out['id'] = str(doc.get('name', '')).split('/')[-1]
    return out

def _fsw_friendly(tool_response, kind):
    try:
        body = tool_response.get('data') if isinstance(tool_response, dict) and 'data' in tool_response else tool_response
        if kind == 'query':
            rows = body if isinstance(body, list) else None
            if rows is None and isinstance(body, dict):
                rows = body.get('result') if isinstance(body.get('result'), list) else body.get('documents')
            if isinstance(rows, list):
                docs = []
                for r in rows:
                    d = r.get('document') if isinstance(r, dict) and 'document' in r else r
                    if isinstance(d, dict) and d.get('fields') is not None:
                        docs.append(_fsw_doc(d))
                return {"status": "success", "code": "OK", "data": {"documents": docs, "count": len(docs)}}
        elif kind in ('create', 'patch'):
            if isinstance(body, dict) and isinstance(body.get('fields'), dict) and body.get('name'):
                d = _fsw_doc(body)
                d['message'] = 'Recorded.' if kind == 'create' else 'Updated.'
                return {"status": "success", "code": "OK", "data": d}
        elif kind == 'delete':
            if body in ({}, None, []) or (isinstance(body, dict) and not body):
                return {"status": "success", "code": "OK", "data": {"deleted": True, "message": "Deleted."}}
        blob = repr(tool_response)
        if kind == 'create' and ('ALREADY_EXISTS' in blob or 'code=409' in blob or "'code': 409" in blob or 'already exists' in blob.lower()):
            return {"status": "business_error", "code": "DUPLICATE_REQUEST", "data": {
                "message": "This exact request was already submitted a moment ago, so it was not repeated. "
                           "Tell the customer it is already recorded; do not retry."}}
        if kind in ('patch', 'delete') and ('NOT_FOUND' in blob or 'code=404' in blob or "'code': 404" in blob):
            return {"status": "business_error", "code": "NOT_FOUND", "data": {
                "message": "That record does not exist (check the id). Nothing was changed."}}
    except Exception:
        pass
    return tool_response

_ST_WORDS = {'approved': 'approved', 'referred': 'with a specialist for review', 'under_review': 'under review',
             'declined': 'not approved', 'in_progress': 'in progress', 'decision_pending': 'waiting for a decision',
             'submitted': 'received', 'received': 'received'}
_ST_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

def _st_when(ts):
    ts = str(ts or '')
    try:
        return _ST_MONTHS[int(ts[5:7]) - 1] + " " + str(int(ts[8:10]))
    except Exception:
        return ts[:10]

def _st_money(x):
    try:
        return "$" + format(float(x), ",.0f")
    except Exception:
        return ""

def _st_docs(response):
    body = response.get('data') if isinstance(response, dict) else None
    rows = body.get('documents') if isinstance(body, dict) else (body if isinstance(body, list) else None)
    docs = [r for r in (rows or []) if isinstance(r, dict)]
    docs.sort(key=lambda d: str(d.get('createdAt', '')), reverse=True)
    return docs

def _status_summary_for(short, response):
    docs = _st_docs(response)
    if not docs:
        return ''
    if short == 'queryApplications':                       # credit cards
        bits = []
        for d in docs[:2]:
            name = str(d.get('cardType') or 'credit card').replace('_', ' ').strip()
            word = _ST_WORDS.get(str(d.get('status', '')).lower(), '')
            line = "the " + name + " from " + _st_when(d.get('createdAt')) + (": " + word if word else "")
            if str(d.get('status', '')).lower() == 'approved' and _st_money(d.get('approvedCreditLimit')):
                line += " with a " + _st_money(d.get('approvedCreditLimit')) + " limit"
            bits.append(line)
        return ("Your most recent card application is " + bits[0] + "." +
                ((" You also have " + bits[1] + ".") if len(bits) > 1 else ""))
    if short == 'queryLoanApplications':                   # loans: the record has no decision field, so only say received
        bits = []
        for d in docs[:2]:
            kind = str(d.get('type') or 'loan').replace('_', ' ')
            bit = "a " + _st_money(d.get('amount')) + " " + kind
            if d.get('term'):
                try:
                    bit += " over " + str(int(float(d['term']))) + " months"
                except Exception:
                    pass
            bits.append(bit + " submitted " + _st_when(d.get('createdAt')))
        return "We have received " + " and ".join(bits) + "."
    if short == 'getAccountApplicationStatus':
        d = docs[0]
        word = _ST_WORDS.get(str(d.get('status', '')).lower(), '')
        return ("Your account application from " + _st_when(d.get('createdAt')) + " is " + word + ".") if word else ''
    return ''

def _remember_status_summary(tool_name, response, state):
    """After an application lookup, remember what to say, so a status answer is never chips or cards alone."""
    try:
        short = str(tool_name).split('/')[-1].split('_')[-1]
        if short not in ('queryApplications', 'queryLoanApplications', 'getAccountApplicationStatus'):
            return
        if not isinstance(response, dict) or response.get('status') != 'success':
            return
        text = _status_summary_for(short, response)
        if text:
            import time
            state['spoken_summary'] = json.dumps({'text': text, 'ts': time.time()})
    except Exception:
        pass

def after_tool_callback_impl(tool, input_dict: dict[str, Any], callback_context, tool_response: dict[str, Any]) -> Optional[dict[str, Any]]:
    """
    AT-1 through AT-10 + AT-PAD-rights.
    Returns modified tool_response dict or None.
    """
    state = callback_context.state
    tool_name = tool.name if hasattr(tool, 'name') else str(tool)

    # Normalize GECX full resource path -> short name, exactly as before_tool does.
    # The platform passes the full `projects/.../tools/<id>` form for system-triggered
    # calls, which includes AgentTool invocations. Without this every name-keyed check
    # below (AT-0, WIDGET_TOOLS, STATE_MAP) silently misses.
    if '/' in tool_name:
        tool_name = tool_name.split('/')[-1]

    # AT-0: harvest the identity hub's result into THIS session.
    #
    # acn_identity_security_hub runs as an AgentTool, which the platform executes
    # in its own sub-session (trace: "agent tool session id": "agent-tool-..."").
    # Every set_variable() and STATE_MAP write it performs lands in that throwaway
    # session and dies with it, so the parent kept customer_id="" even after the
    # customer had fully authenticated. BT-1 then blocked every customer-data tool
    # forever -> unbounded retries -> RESOURCE_EXHAUSTED.
    #
    # The hub therefore emits a machine-readable trailer, which we parse into state
    # and STRIP before the parent model (and the customer) ever sees it.
    if tool_name in {'acn_identity_security_hub', 'call_identity_hub'}:
        return _harvest_identity_hub(tool_response, state, str((input_dict or {}).get('request', '') or ''))

    # Hand the widget payload back exactly as it came. Normalising it would
    # destroy the shape the client renders -- see WIDGET_TOOLS.
    if tool_name in WIDGET_TOOLS:
        return tool_response

    _fsw_kind = _FSW_KINDS.get(tool_name)
    if _fsw_kind:
        tool_response = _fsw_friendly(tool_response, _fsw_kind)

    # AT-1: Tri-state normalization
    response = _normalize_response(tool_response)

    # AT-3: Payload masking
    response = _mask_payload(response)

    # AT-4: Ownership check
    customer_id = state.get("customer_id", "")
    data = response.get("data", {})
    if isinstance(data, dict) and customer_id:
        resp_cid = data.get("customerId", data.get("customer_id", ""))
        if resp_cid and resp_cid != customer_id:
            logger.warning(f"AT-4 OWNERSHIP VIOLATION: {tool_name}")
            return {"status": "business_error", "code": "NOT_FOUND", "data": {}}

    # AT-5: State persistence
    _persist_state(tool_name, response, state)

    # AT-6: Journey context
    _update_journey_context(tool_name, response, state)

    # AT-7: Counters + degraded mode
    if response.get("status") == "system_error":
        count = int(_cnt(state).get("tool_errors", "0") or "0") + 1
        _set_cnt(state, tool_errors=str(count))
        if count >= 2:
            degraded = json.loads(state.get("degraded_toolsets", "[]") or "[]")
            if tool_name not in degraded:
                degraded.append(tool_name)
                state["degraded_toolsets"] = json.dumps(degraded)
            if not state.get("escalation_reason"):
                state["escalation_reason"] = "system_error"
    else:
        _set_cnt(state, tool_errors="0")

    # AT-10: Audit logging
    if tool_name not in {'getConfig', 'searchFAQs', 'getFAQ', 'getExchangeRate', 'getGICRates'}:
        logger.info(
            f"AUDIT: tool={tool_name} status={response.get('status')} "
            f"idempotency_key={_txn(state).get('idempotency_key', '')} "
            f"journey_id={json.loads(state.get('journey_context','{}') or '{}').get('journey_id','')}"
        )

    # AT-PAD-rights: After cancelPAD success
    if tool_name == 'cancelPAD' and response.get("status") == "success":
        response["_instruction"] = "DELIVER VERBATIM: {{copy.pad_cancellation_rights}}"
        state["pad_cancel_id"] = data.get("cancelId", "") if isinstance(data, dict) else ""

    # Reset idempotency key after successful write
    WRITE_TOOLS = {'createTransaction', 'createRedemption', 'createFXOrder', 'createStopPayment',
                   'createBankDraft', 'createNSFReversal', 'cancelPAD'}
    if tool_name in WRITE_TOOLS and response.get("status") == "success":
        _set_txn(state, idempotency_key="", awaiting_confirmation=False)

    _remember_status_summary(tool_name, response, state)
    return response

def _normalize_response(response: dict[str, Any]) -> dict:
    """AT-1: Normalize to {status, code, data}."""
    if not isinstance(response, dict):
        return {"status": "system_error", "code": "INVALID_RESPONSE", "data": {}}
    status = response.get("status", "")
    if status in {"success", "business_error", "validation_error", "system_error"}:
        return response
    # A toolset failure arrives as {"data": {"error", "errorCode", "status": "error"}, "status": "error"}.
    # "error" is not one of the statuses above, so it used to fall through to the generic branch
    # below and be relabelled status="success" with the error buried inside: the model then
    # reported success for writes that had failed. Report failures as failures.
    _d = response.get("data")
    if (status == "error"
            or (isinstance(_d, dict) and _d.get("status") == "error")
            or (isinstance(_d, dict) and _d.get("errorCode"))
            or (isinstance(_d, dict) and "error" in _d and not any(k in _d for k in ("fields", "documents", "name")))):
        _code = ""
        if isinstance(_d, dict):
            _code = str(_d.get("errorCode") or _d.get("error") or "")
        _code = _code or str(response.get("errorCode") or response.get("error") or response.get("code") or "ERROR")
        _kind = "system_error" if _code.upper() in {"INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED", "UNKNOWN"} else "business_error"
        return {"status": _kind, "code": _code[:80], "data": _d if isinstance(_d, dict) else response}
    # Map HTTP-style or raw responses
    if "error" in response:
        return {"status": "business_error", "code": response["error"], "data": response}
    if "data" in response or "result" in response:
        return {"status": "success", "code": "OK", "data": response.get("data", response.get("result", {}))}
    return {"status": "success", "code": "OK", "data": response}

def _mask_payload(response: dict[str, Any]) -> dict:
    """AT-3: Mask sensitive fields."""
    SENSITIVE_FIELDS = {'pin_hash', 'otp_secret', 'cvv', 'sin', 'password', 'security_answers',
                         'password_hash', 'secret_question_answer'}
    data = response.get("data", {})
    if isinstance(data, dict):
        for field in list(data.keys()):
            if field in SENSITIVE_FIELDS:
                del data[field]
        # Mask PAN
        for field in ('cardNumber', 'pan', 'accountNumber'):
            if field in data and isinstance(data[field], str) and len(data[field]) > 4:
                data[field] = "•••• " + data[field][-4:]
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                for field in list(item.keys()):
                    if field in SENSITIVE_FIELDS:
                        del item[field]
    return response

def _persist_state(tool_name: str, response: dict[str, Any], state: dict[str, Any]) -> None:
    """AT-5: Map tool outputs to session variables."""
    if response.get("status") != "success":
        return
    # verify_otp / verify_pin return FLAT dicts with no 'data' wrapper.
    FLAT_TOOLS = {'verify_otp', 'verify_pin'}
    data = response if tool_name in FLAT_TOOLS else response.get("data", {})
    if not isinstance(data, dict):
        return

    STATE_MAP = {
        'identify_customer': {
            'customerId':    'customer_id',
            'customer_id':   'customer_id',
            'authLevel':     'auth_state.level',
            'auth_level':    'auth_state.level',
            'identifiedBy':  'customer_profile.identified_by',
            'identified_by': 'customer_profile.identified_by',
        },
        # verify_otp / verify_pin emit flat snake_case 'auth_level'.
        'verify_otp': {
            'authLevel':  'auth_state.level',
            'auth_level': 'auth_state.level',
            'authMode':   'auth_state.mode',
            'auth_mode':  'auth_state.mode',
        },
        'verify_pin': {
            'customer_id': 'customer_id',
            'authLevel':   'auth_state.level',
            'auth_level':  'auth_state.level',
            'authMode':    'auth_state.mode',
            'auth_mode':   'auth_state.mode',
        },
        'authenticate': {
            'authLevel':  'auth_state.level',
            'auth_level': 'auth_state.level',
            'authMode':   'auth_state.mode',
            'auth_mode':  'auth_state.mode',
        },
        'authorize_step_up': {
            'stepUpValidUntil':    'auth_state.step_up_valid_until',
            'step_up_valid_until': 'auth_state.step_up_valid_until',
            'stepUpActionHash':    'auth_state.step_up_action_hash',
            'step_up_action_hash': 'auth_state.step_up_action_hash',
        },
        'getCustomer': {
            # Firestore snake_case
            'preferred_name':    'customer_profile.display_name',
            'legal_name':        'customer_profile.first_name',
            'registered_mobile': 'customer_profile.phone_masked',
            'member_since':      'customer_profile.since_year',
            'segment':           'customer_profile.segment',
            'email':             'customer_profile.email_masked',
            'marketing_opt_out': 'customer_profile.marketing_opt_out',
            'vulnerability_flag':'customer_profile.vulnerable_flag',
            'preferred_language':'customer_profile.preferred_language',
            # camelCase fallback
            'preferredName':     'customer_profile.display_name',
            'firstName':         'customer_profile.first_name',
            'phone':             'customer_profile.phone_masked',
            'memberSince':       'customer_profile.since_year',
            'marketingOptOut':   'customer_profile.marketing_opt_out',
            'vulnerabilityFlag': 'customer_profile.vulnerable_flag',
            'preferredLanguage': 'customer_profile.preferred_language',
        },
        'getCustomerSegment': {
            'segment':    'customer_profile.segment',
            'life_stage': 'cie_context.life_stage',
            'lifeStage':  'cie_context.life_stage',
        },
        'getNextBestActions': {
            'actions':      'cie_context.next_best_action',
            'next_actions': 'cie_context.next_best_action',
        },
        'getRewardsBalance': {
            'points':        'rewards_balance_points',
            'balancePoints': 'rewards_balance_points',
        },
        'createAppointment': {
            'appointment_id': 'appointment_id',
            'appointmentId':  'appointment_id',
        },
        'createStopPayment': {
            'stop_payment_id': 'stop_payment_id',
            'stopPaymentId':   'stop_payment_id',
        },
        'createFXOrder': {
            'rate':   'transaction_context.fx_rate_quoted',
            'fxRate': 'transaction_context.fx_rate_quoted',
        },
    }

    mappings = STATE_MAP.get(tool_name, {})
    for src_key, dest_key in mappings.items():
        if src_key in data:
            val = data[src_key]
            val_str = json.dumps(val) if isinstance(val, (list, dict)) else str(val)
            if '.' in dest_key:
                grp, field = dest_key.split('.', 1)
                g = json.loads(state.get(grp, '{}') or '{}')
                g[field] = val_str
                state[grp] = json.dumps(g)
            else:
                state[dest_key] = val_str

def _update_journey_context(tool_name: str, response: dict[str, Any], state: dict[str, Any]) -> None:
    """AT-6: Update journey context and completed_actions."""
    if response.get("status") != "success":
        return
    try:
        ctx = json.loads(state.get("journey_context", "{}") or "{}")
        ctx["last_tool"] = tool_name
        ctx["last_tool_status"] = "success"
        state["journey_context"] = json.dumps(ctx)

        completed = json.loads(state.get("completed_actions", "[]") or "[]")
        completed.append({"tool": tool_name, "timestamp": datetime.now(timezone.utc).isoformat()})
        state["completed_actions"] = json.dumps(completed[-20:])  # Keep last 20
    except Exception:
        pass

# --- Entry point ---
def after_tool_callback(tool: Tool, input: dict[str, Any], callback_context: CallbackContext, tool_response: dict[str, Any]) -> Optional[dict[str, Any]]:
    return after_tool_callback_impl(tool, input, callback_context, tool_response)

_AUTH_RESULT_RE = re.compile(r'\[\[AUTH_RESULT(?P<body>[^\]]*)\]\]')

def _hub_value(fields: dict[str, str], key: str) -> str:
    """A trailer field, with the hub's `-` / none / null placeholders read as empty."""
    value = (fields.get(key, '') or '').strip()
    return '' if value.lower() in ('-', 'none', 'null') else value

def _put_hub_text(tool_response: Any, text: str) -> Any:
    """Return tool_response with the hub's text replaced, keeping its shape."""
    if isinstance(tool_response, dict):
        out = dict(tool_response)
        data = out.get('data')
        if isinstance(data, dict) and 'response' in data:
            data = dict(data)
            data['response'] = text
            out['data'] = data
        else:
            out['response'] = text
        return out
    return text

_HUB_PIN_REQUEST_RE = re.compile(r'\bPIN\b|step-?up|verify|authenticat', re.IGNORECASE)

_HUB_PIN_ENTERED_RE = re.compile(r'\bentered\b|\bdtmf\b|\*{3,}', re.IGNORECASE)

_HUB_STEPUP_RE = re.compile(r'step-?up|\bL3\b|auth_level\s*3|level\s*3', re.IGNORECASE)

def _hub_status_text(request: str, customer_id: str, level: int) -> str:
    """What the parent model should be told when the hub had nothing to say.

    The hub is told to STOP silently after a successful identify / PIN check, so
    once the trailer is stripped its reply is empty. CES replaces an empty
    AgentTool reply with "Hmm, I'm having trouble with that. Do you want me to try
    again?" -- the parent model then apologises to the customer, retries the hub
    (each retry burns a PIN attempt) and never asks for the PIN. Say what actually
    happened and what to do next instead.
    """
    req = request or ''
    entered = bool(_HUB_PIN_ENTERED_RE.search(req))
    stepup = bool(_HUB_STEPUP_RE.search(req))
    pin_prompt = ("on chat say \"For this action, please re-enter your 4-digit PIN.\"; on voice say "
                  "\"For this action, please re-enter your 4-digit PIN on your keypad now, or say it.\"")
    if stepup:
        if level >= 3:
            return ("Step-up verified: the customer is authorized (L3) for this action. "
                    "Continue the action now. Do not ask for the PIN again and do not "
                    "call the identity hub again.")
        if not entered:
            # A step-up was requested but no PIN has been supplied yet: the customer must be asked.
            return ("Step-up required: the customer is NOT yet authorized for this action. Ask them "
                    "to re-enter their 4-digit PIN now (" + pin_prompt + "). Do not continue the "
                    "action and do not call the identity hub again until they reply with the PIN.")
        return ("The step-up PIN was not accepted. Tell the customer it didn't match and ask them to "
                "re-enter their 4-digit PIN. They get 3 attempts in total; after the third failure "
                "tell them a specialist will help from here and stop trying. Do not continue the "
                "action and do not call the identity hub again until they reply.")
    if level >= 3:
        return ("Step-up verified: the customer is authorized (L3) for this action. "
                "Continue the action now. Do not ask for the PIN again and do not "
                "call the identity hub again.")
    if level == 2:
        return ("PIN verified: the customer is authenticated (L2). Continue with the "
                "customer's original request now. Do not ask for the PIN again and "
                "do not call the identity hub again.")
    if customer_id and not _HUB_PIN_REQUEST_RE.search(req):
        return ("Customer identified (L1). This is a success, not an error. Next, ask "
                "the customer for their 4-digit PIN: on chat say \"To verify it's you, "
                "please type your 4-digit PIN.\"; on voice say \"For your security, "
                "please enter your 4-digit PIN on your keypad now, or say it.\" Do not "
                "call the identity hub again until the customer replies with the PIN.")
    if customer_id and not entered:
        # Asked to authenticate to L2 but no PIN supplied yet: prompt for it.
        return ("The customer is identified (L1) but not yet verified. Ask them for their 4-digit PIN: "
                "on chat say \"To verify it's you, please type your 4-digit PIN.\"; on voice say "
                "\"For your security, please enter your 4-digit PIN on your keypad now, or say it.\" "
                "Do not call the identity hub again until they reply with the PIN.")
    if customer_id:
        return ("The PIN was not accepted. Tell the customer it didn't match and ask "
                "them to re-enter their 4-digit PIN. They get 3 attempts in total; "
                "after the third failure tell them a specialist will help from here "
                "and stop trying. Do not call the identity hub again until they reply.")
    return ("No customer was identified from what was provided. Ask the customer to "
            "re-enter their registered 10-digit phone number. Do not call the "
            "identity hub again until they reply.")

def _harvest_identity_hub(tool_response: dict[str, Any], state: dict[str, Any], request: str = '') -> dict[str, Any]:
    """Pull customer_id / auth_level out of the hub's reply, then strip the marker.

    The hub is an AgentTool: its text IS its return value, and its sub-session
    state never reaches us. The trailer is the only channel it has to report
    what it actually established.
    """
    text = ''
    if isinstance(tool_response, dict):
        data = tool_response.get('data')
        if isinstance(data, dict):
            text = str(data.get('response', '') or '')
        if not text:
            text = str(tool_response.get('response', '') or '')
    else:
        text = str(tool_response or '')

    match = _AUTH_RESULT_RE.search(text)
    if not match:
        if text.strip():
            return tool_response
        # No trailer and no text: the hub returned nothing at all.
        return _put_hub_text(
            tool_response,
            _hub_status_text(request, str(state.get('customer_id', '') or ''),
                             int(_auth(state).get('level', '0') or '0')))

    fields = {}
    for part in match.group('body').split():
        if '=' in part:
            key, _, value = part.partition('=')
            fields[key.strip()] = value.strip()

    customer_id = _hub_value(fields, 'customer_id')
    if customer_id:
        state['customer_id'] = customer_id
        state['customerId'] = customer_id
        _set_auth(state, customer_id=customer_id)
        _set_cust(state, customer_id=customer_id)

    level = _hub_value(fields, 'auth_level')
    if level.isdigit():
        # Never downgrade a level the session already earned.
        current = int(_auth(state).get('level', '0') or '0')
        _set_auth(state, level=str(max(current, int(level))))
        state['auth_level'] = str(max(current, int(level)))

    mode = _hub_value(fields, 'auth_mode')
    if mode:
        _set_auth(state, mode=mode)
        state['auth_mode'] = mode

    identified_by = _hub_value(fields, 'identified_by')
    if identified_by:
        _set_cust(state, identified_by=identified_by)
        state['identified_by'] = identified_by

    logger.info(
        f"AT-0 identity hub harvested: customer_id={customer_id or '-'} "
        f"auth_level={level or '-'} auth_mode={mode or '-'}"
    )

    # Strip the marker so it is never spoken or shown.
    cleaned = _AUTH_RESULT_RE.sub('', text).strip()
    if not cleaned:
        effective_cid = customer_id or str(state.get('customer_id', '') or '')
        effective_level = int(_auth(state).get('level', '0') or '0')
        cleaned = _hub_status_text(request, effective_cid, effective_level)
    return _put_hub_text(tool_response, cleaned)
