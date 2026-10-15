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
    'acn-insight-card', 'acn-nudge-card', 'acn-payee-selector',
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

def _cie(state):   return json.loads(state.get("cie_context",         "{}") or "{}")

def _txn(state):   return json.loads(state.get("transaction_context", "{}") or "{}")

def _cnt(state):   return json.loads(state.get("session_counters",    "{}") or "{}")

def _set_auth(state, **kw): a=_auth(state); a.update(kw); state["auth_state"]          = json.dumps(a)

def _set_cust(state, **kw): c=_cust(state); c.update(kw); state["customer_profile"]   = json.dumps(c)

def _set_cie(state,  **kw): c=_cie(state);  c.update(kw); state["cie_context"]        = json.dumps(c)

def _set_txn(state,  **kw): t=_txn(state);  t.update(kw); state["transaction_context"]= json.dumps(t)

def _set_cnt(state,  **kw): c=_cnt(state);  c.update(kw); state["session_counters"]   = json.dumps(c)

# -- Flat session variable <-> JSON group bridge ------------------------------
# The ACN Bank web page (src/App.jsx customerVariables) and AT STATE_MAP both
# write FLAT session variables (pref_name, auth_level, customer_first_name...).
# The injectors below read the JSON GROUPS (customer_profile, auth_state,
# cie_context). Without this bridge the groups stay empty, every turn injects
# "name= | auth_level=0", and the agent re-asks for identity it already has.
def _first_nonempty(state, *keys):
    for k in keys:
        v = state.get(k)
        if v not in (None, "", "null"):
            return str(v)
    return ""

def _seed_identity_from_session(state) -> None:
    """Mirror flat page/tool variables into the JSON groups the injectors read."""
    cust = _cust(state)
    auth = _auth(state)

    first = _first_nonempty(state, "customer_first_name", "pref_name")
    if not first:
        full = _first_nonempty(state, "customer_display_name", "customer_name")
        first = full.split()[0] if full else ""
    updates = {
        "first_name":    first,
        "last_name":     _first_nonempty(state, "customer_last_name"),
        "display_name":  _first_nonempty(state, "customer_display_name", "pref_name", "customer_name"),
        "email_masked":  _first_nonempty(state, "customer_email_masked"),
        "phone_masked":  _first_nonempty(state, "customer_phone_masked"),
        "segment":       _first_nonempty(state, "customer_segment", "spending_persona"),
        "since_year":    _first_nonempty(state, "customer_since_year"),
        "identified_by": _first_nonempty(state, "identified_by"),
    }
    changed = {k: v for k, v in updates.items() if v and cust.get(k) != v}
    if changed:
        _set_cust(state, **changed)

    # auth_state.level is what _inject_auth_context reports. The page sets a
    # numeric auth_level (2 once signed in); AT STATE_MAP sets it from
    # identify_customer. Never downgrade a level the session already earned --
    # expiry in BA-2/BA-3 is the only thing allowed to drop it.
    auth_changed = {}
    flat_level = _first_nonempty(state, "auth_level")
    if flat_level:
        try:
            if int(float(flat_level)) > int(float(auth.get("level", "0") or "0")):
                auth_changed["level"] = str(int(float(flat_level)))
        except (TypeError, ValueError):
            pass
    mode = _first_nonempty(state, "auth_mode")
    if mode and mode != "guest" and auth.get("mode") != mode:
        auth_changed["mode"] = mode
    for flat in ("step_up_valid_until", "step_up_action_hash"):
        v = _first_nonempty(state, flat)
        if v and auth.get(flat) != v:
            auth_changed[flat] = v
    if auth_changed:
        _set_auth(state, **auth_changed)

    cie = _cie(state)
    cie_changed = {}
    life = _first_nonempty(state, "life_stage_signal")
    if life and cie.get("life_stage") != life:
        cie_changed["life_stage"] = life
    nba = _first_nonempty(state, "next_best_action")
    if nba and nba != "[]" and cie.get("next_best_action") != nba:
        cie_changed["next_best_action"] = nba
    if cie_changed:
        _set_cie(state, **cie_changed)

# ---------------------------------------------------------------------------
# AT: after_tool_callback
# ---------------------------------------------------------------------------
def after_tool_callback_impl(tool, input_dict: dict[str, Any], callback_context, tool_response: dict[str, Any]) -> Optional[dict[str, Any]]:
    """
    AT-1 through AT-10 + AT-PAD-rights.
    Returns modified tool_response dict or None.
    """
    state = callback_context.state
    tool_name = tool.name if hasattr(tool, 'name') else str(tool)


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
        return _harvest_identity_hub(tool_response, state)

    # Hand the widget payload back exactly as it came. Normalising it would
    # destroy the shape the client renders -- see WIDGET_TOOLS.
    if tool_name in WIDGET_TOOLS:
        return tool_response

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

    return response

def _normalize_response(response: dict[str, Any]) -> dict:
    """AT-1: Normalize to {status, code, data}."""
    if not isinstance(response, dict):
        return {"status": "system_error", "code": "INVALID_RESPONSE", "data": {}}
    status = response.get("status", "")
    if status in {"success", "business_error", "validation_error", "system_error"}:
        return response
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

    # verify_otp and verify_pin return flat dicts (no 'data' wrapper)
    FLAT_TOOLS = {'verify_otp', 'verify_pin'}
    data = response if tool_name in FLAT_TOOLS else response.get("data", {})
    if not isinstance(data, dict):
        return

    STATE_MAP = {
        # identify_customer returns camelCase fields nested under 'data'
        'identify_customer': {
            'customerId':    'customer_id',
            'customer_id':   'customer_id',
            'authLevel':     'auth_state.level',
            'auth_level':    'auth_state.level',
            'identifiedBy':  'identified_by',
            'identified_by': 'identified_by',
        },
        # verify_otp / verify_pin return flat snake_case dicts (no 'data' wrapper).
        # They emit 'auth_level' (snake), NOT 'authLevel' — mapping only the
        # camelCase key silently dropped every L2 grant and deadlocked the PIN
        # step. Accept both casings and write the JSON group the injectors read.
        'verify_otp': {
            'authLevel':  'auth_state.level',
            'auth_level': 'auth_state.level',
            'authMode':   'auth_state.mode',
            'auth_mode':  'auth_state.mode',
        },
        'verify_pin': {
            'authLevel':  'auth_state.level',
            'auth_level': 'auth_state.level',
            'authMode':   'auth_state.mode',
            'auth_mode':  'auth_state.mode',
        },
        # authorize_step_up returns camelCase fields nested under 'data'
        'authorize_step_up': {
            'authLevel':           'auth_state.level',
            'auth_level':          'auth_state.level',
            'stepUpValidUntil':    'auth_state.step_up_valid_until',
            'step_up_valid_until': 'auth_state.step_up_valid_until',
            'stepUpActionHash':    'auth_state.step_up_action_hash',
            'step_up_action_hash': 'auth_state.step_up_action_hash',
        },
        'getCustomer': {
            # Firestore snake_case (actual API response)
            'preferred_name':    'customer_display_name',
            'legal_name':        'customer_first_name',
            'registered_mobile': 'customer_phone_masked',
            'member_since':      'customer_since_year',
            'segment':           'customer_segment',
            'email':             'customer_email_masked',
            # camelCase fallback (OpenAPI schema)
            'preferredName':     'customer_display_name',
            'firstName':         'customer_first_name',
            'phone':             'customer_phone_masked',
            'memberSince':       'customer_since_year',
        },
        'getCustomerSegment': {
            'segment':    'customer_segment',
            'life_stage': 'life_stage_signal',
            'lifeStage':  'life_stage_signal',
        },
        'getNextBestActions': {
            'actions': 'next_best_action',
        },
        'getRewardsBalance': {
            'points': 'rewards_balance_points',
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
            'rate': 'fx_rate_quoted',
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

    # STATE_MAP writes flat keys; the model-side injectors read the JSON
    # groups. Mirror now so the very next turn sees the identity.
    _seed_identity_from_session(state)

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

def _harvest_identity_hub(tool_response: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
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
        return tool_response

    fields = {}
    for part in match.group('body').split():
        if '=' in part:
            key, _, value = part.partition('=')
            fields[key.strip()] = value.strip()

    customer_id = fields.get('customer_id', '')
    if customer_id and customer_id.lower() not in ('none', 'null', ''):
        state['customer_id'] = customer_id
        state['customerId'] = customer_id

    level = fields.get('auth_level', '')
    if level.isdigit():
        # Never downgrade a level the session already earned.
        current = int(_auth(state).get('level', '0') or '0')
        _set_auth(state, level=str(max(current, int(level))))
        state['auth_level'] = str(max(current, int(level)))

    mode = fields.get('auth_mode', '')
    if mode:
        _set_auth(state, mode=mode)
        state['auth_mode'] = mode

    identified_by = fields.get('identified_by', '')
    if identified_by:
        _set_cust(state, identified_by=identified_by)
        state['identified_by'] = identified_by

    logger.info(
        f"AT-0 identity hub harvested: customer_id={customer_id or '-'} "
        f"auth_level={level or '-'} auth_mode={mode or '-'}"
    )

    # Strip the marker so it is never spoken or shown.
    cleaned = _AUTH_RESULT_RE.sub('', text).strip()
    if isinstance(tool_response, dict):
        out = dict(tool_response)
        data = out.get('data')
        if isinstance(data, dict) and 'response' in data:
            data = dict(data)
            data['response'] = cleaned
            out['data'] = data
        elif 'response' in out:
            out['response'] = cleaned
        return out
    return cleaned
