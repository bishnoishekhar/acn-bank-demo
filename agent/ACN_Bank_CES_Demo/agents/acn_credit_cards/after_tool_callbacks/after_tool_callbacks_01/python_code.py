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

def _txn(state):   return json.loads(state.get("transaction_context", "{}") or "{}")

def _cnt(state):   return json.loads(state.get("session_counters",    "{}") or "{}")

def _set_txn(state,  **kw): t=_txn(state);  t.update(kw); state["transaction_context"]= json.dumps(t)

def _set_cnt(state,  **kw): c=_cnt(state);  c.update(kw); state["session_counters"]   = json.dumps(c)

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
            'authLevel':  'auth_state.level',
            'auth_level': 'auth_state.level',
            'authMode':   'auth_state.mode',
            'auth_mode':  'auth_state.mode',
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
