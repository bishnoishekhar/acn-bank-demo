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
# the payload the client renders. The tool pipeline in this module is built for
# backend data tools -- it rewraps every response as {status, code, data}, masks
# fields, and enforces identity/ownership/auth. Put a widget payload through
# that and it comes back out as {"status": "success", "data": {...}}, which the
# platform no longer recognises as a widget. The tool fires, nothing renders,
# and nothing errors. That silent failure is what this set exists to prevent.
#
# These tools bypass the pipeline in both directions. They read no customer
# data, so there is nothing to mask, own or gate.
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

    # AT-widget-pair: force the calculator widget to follow its estimate tool.
    #
    # The instruction already says to emit these, but the model reliably calls
    # the estimate tool, gets a complete result, and then asks for income, down
    # payment and debts in prose anyway -- so the customer types the numbers the
    # sliders exist to collect. Prompt wording did not move it; this does,
    # because the directive arrives attached to the tool result it refers to,
    # at the moment the model is deciding what to do next.
    WIDGET_FOR_ESTIMATE = {
        'mortgage_affordability_estimate': 'mortgage_affordability',
        'mortgage_payment_estimate': 'mortgage_calculator',
        # The rate board is the same trap: the model happily reads the four
        # rates out as a bulleted list and never emits the shelf, which is
        # where the projection chart and the break-even month live. Those are
        # the whole point of showing fixed against variable honestly -- a
        # prose list drops them silently.
        'mortgage_rate_board': 'mortgage_rate_shelf',
    }
    widget = WIDGET_FOR_ESTIMATE.get(tool_name)
    if widget and response.get("status") == "success" and state.get("widgets_enabled"):
        if widget == 'mortgage_rate_shelf':
            # Deliberately does NOT name a single widget. There are three rate
            # intents (MTG-01 step 2) and naming one here fought the
            # instruction: when this said "emit mortgage_rate_shelf" while the
            # instruction said "emit mortgage_rate_table for information", the
            # model resolved the contradiction by emitting neither. State the
            # non-negotiable part -- some rate widget, never a prose list --
            # and leave the choice to the instruction.
            response["_instruction"] = (
                "NOW emit a rate widget in this same turn, copying every figure "
                "from this response. Choose per MTG-01 step 2: "
                "mortgage_rate_table when they are only asking what the rates "
                "are; mortgage_rate_shelf with expand_projection=true and the "
                "best variable product recommended when they are comparing fixed "
                "against variable; mortgage_rate_shelf normally when they are "
                "choosing. Include variable_projection and "
                "variable_projection_disclaimer whenever present. Do NOT read "
                "the rates out as a text list instead -- that silently drops the "
                "projection chart. Say one short line, then emit the widget."
            )
        else:
            response["_instruction"] = (
                f"NOW call {widget} and emit it, in this same turn. Use the "
                f"figures in this response as defaults and bounds. Do NOT ask the "
                f"customer for income, down payment or monthly debts in text -- "
                f"the widget's sliders collect them, and asking first makes them "
                f"answer twice. Say one short line, then emit the widget."
            )

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
