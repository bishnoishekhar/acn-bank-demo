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

from typing import Any, Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FRAUD_PATTERNS = re.compile(
    r'\b(fraud|scam|unauthorized|hacked|stolen funds?|someone took|wire fraud|'
    r'I was scammed|my account was compromised|suspicious transaction)\b',
    re.IGNORECASE
)

LOST_PATTERNS = re.compile(
    r'\b(lost (my )?card|stolen (my )?card|card (is |was )?(lost|stolen|missing)|'
    r'I lost my card|my card was stolen)\b',
    re.IGNORECASE
)

SELF_HARM_PATTERNS = re.compile(
    r'\b(kill myself|end my life|suicide|self.harm|hurt myself|no reason to live)\b',
    re.IGNORECASE
)

INJECTION_PATTERNS = re.compile(
    r'(ignore (previous|all|your) instructions?|system prompt|you are now|'
    r'disregard (all )?previous|act as (if )?|new persona|DAN mode|jailbreak)',
    re.IGNORECASE
)

# ── JSON group helpers ──────────────────────────────────────────────────────
def _auth(state):  return json.loads(state.get("auth_state",          "{}") or "{}")

def _cust(state):  return json.loads(state.get("customer_profile",    "{}") or "{}")

def _cie(state):   return json.loads(state.get("cie_context",         "{}") or "{}")

def _cnt(state):   return json.loads(state.get("session_counters",    "{}") or "{}")

def _set_cust(state, **kw): c=_cust(state); c.update(kw); state["customer_profile"]   = json.dumps(c)

def _set_cie(state,  **kw): c=_cie(state);  c.update(kw); state["cie_context"]        = json.dumps(c)

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

# ---------------------------------------------------------------------------
# BM: before_model_callback
# ---------------------------------------------------------------------------
def _fn_response_names(llm_request) -> set:
    """Names of the tools whose results are the LAST thing in the request (empty if the
    last content is not purely tool results)."""
    try:
        cs = list(getattr(llm_request, 'contents', None) or [])
        parts = list(getattr(cs[-1], 'parts', None) or []) if cs else []
        names = set()
        for p in parts:
            fr = getattr(p, 'function_response', None)
            if fr is None:
                return set()
            names.add(str(getattr(fr, 'name', '') or ''))
        return names
    except Exception:
        return set()

def _hub_state_val(state, *keys) -> str:
    for k in keys:
        v = state.get(k)
        if v not in (None, "", "null"):
            return str(v)
    return "-"

def _hub_trailer(state) -> str:
    level = _hub_state_val(state, "auth_level")
    if level == "-":
        try:
            level = str(json.loads(state.get("auth_state", "{}") or "{}").get("level", "0") or "0")
        except Exception:
            level = "0"
    return ("[[AUTH_RESULT customer_id=" + _hub_state_val(state, "customer_id", "customerId")
            + " auth_level=" + level
            + " auth_mode=" + _hub_state_val(state, "auth_mode")
            + " identified_by=" + _hub_state_val(state, "identified_by") + "]]")

def _hub_request_text(llm_request) -> str:
    out = []
    for c in (getattr(llm_request, 'contents', None) or []):
        if getattr(c, 'role', '') == 'user':
            for p in (getattr(c, 'parts', None) or []):
                if getattr(p, 'text', None):
                    out.append(p.text)
    return " ".join(out).lower()

def before_model_callback_impl(callback_context, llm_request) -> Optional[object]:
    """
    BM-1 through BM-14 safety, auth, CIE injection, language lock.
    Returns None to allow LLM to proceed; returns LlmResponse to short-circuit.
    """
    state = callback_context.state

    # Fast path: once identify_customer / verify_pin / authorize_step_up have run, the only
    # thing left is the AUTH_RESULT trailer, which comes from state. Skip the second LLM
    # call (~0.7s). Two-tool requests still go to the model: identify + PIN in one request,
    # and verify_pin -> authorize_step_up for an L3 step-up.
    _done = _fn_response_names(llm_request)
    if _done:
        _req = _hub_request_text(llm_request)
        _has_pin = ('pin' in _req) or ('verify' in _req)
        _stepup = ('step-up' in _req) or ('stepup' in _req) or ('l3' in _req)
        _final = (
            ('authorize_step_up' in _done)
            or ('verify_pin' in _done and not _stepup)
            or (_done == {'identify_customer'} and not _has_pin and not _stepup)
        )
        if _final and _done <= {'identify_customer', 'verify_pin', 'authorize_step_up'}:
            return LlmResponse.from_parts(parts=[Part.from_text(text=_hub_trailer(state))])
    contents = llm_request.contents if hasattr(llm_request, 'contents') else []

    # Extract latest user utterance
    user_text = _extract_last_user_text(contents)
    if user_text:
        _cid_m = re.search(r'customer_id=([A-Za-z0-9_-]+)', user_text)
        if _cid_m and _cid_m.group(1) not in ('-', 'none', 'null') and not state.get('customer_id'):
            state['customer_id'] = _cid_m.group(1)
        _lvl_m = re.search(r'auth_level=(\d+)', user_text)
        if _lvl_m and not state.get('auth_level'):
            state['auth_level'] = _lvl_m.group(1)

    # BM-3: Safety fast-path (deterministic, runs before everything)
    if user_text and FRAUD_PATTERNS.search(user_text):
        state["fraud_suspected"] = True
        _set_cie(state, nba_suppressed=True)
        state["escalation_reason"] = "fraud_detected"
        # Let LLM route — instruction.txt handles transfer to M4.1

    if user_text and LOST_PATTERNS.search(user_text):
        state["escalation_reason"] = "lost_stolen_card"

    if user_text and SELF_HARM_PATTERNS.search(user_text):
        _set_cust(state, vulnerable_flag=True)
        _set_cie(state, nba_suppressed=True)
        state["escalation_reason"] = "self_harm"

    # BM-4: Escalation route
    retry_strike = int(_cnt(state).get("retry_strikes", "0") or "0")
    if (state.get("escalation_reason") or
            retry_strike >= 3 or
            state.get("live_agent_requested")):
        pass  # LLM instruction handles routing

    # BM-5: Auth state injection
    _inject_auth_context(state, llm_request)

    # BM-6: CIE context injection
    if _cie(state).get("loaded"):
        _inject_cie_context(state, llm_request)

    # BM-7: Nudge eligibility
    _compute_nudge_eligibility(state)

    # BM-8: PIPEDA disclosure pending
    if not state.get("pipeda_disclosed"):
        _inject_instruction(llm_request,
            "DISCLOSURE REQUIRED: Deliver {{copy.pipeda_disclosure}} verbatim before "
            "requesting any personal information from the customer.")

    # BM-9: Vulnerability detection
    if user_text:
        _check_vulnerability(user_text, state)

    # BM-10: Prompt injection guard
    if user_text and INJECTION_PATTERNS.search(user_text):
        count = int(_cnt(state).get("injection_attempts", "0") or "0") + 1
        _set_cnt(state, injection_attempts=str(count))
        if count >= 3:
            state["escalation_reason"] = "injection_limit"

    # BM-12: Small talk
    if user_text and _is_small_talk(user_text):
        count = int(_cnt(state).get("small_talk", "0") or "0") + 1
        _set_cnt(state, small_talk=str(count))
    else:
        _set_cnt(state, small_talk="0")

    # BM-13: After-hours context
    if state.get("after_hours"):
        _inject_instruction(llm_request,
            "AFTER-HOURS CONTEXT: The bank is currently closed. Offer callback scheduling, "
            "secure message, or branch appointment for next business day. Do not promise "
            "live agent transfer for non-emergency requests.")

    # BM-1: Channel lock injection
    channel = state.get("channel", "webchat")
    _inject_instruction(llm_request,
        f"CHANNEL CONTEXT: channel={channel} | "
        f"widgets_enabled={state.get('widgets_enabled', False)} | "
        f"dtmf_enabled={state.get('dtmf_enabled', False)}")

    # BM-2: Language lock
    lang = _cust(state).get("preferred_language", "en-CA")
    if not state.get("session_language_locked") and user_text:
        detected = _detect_language(user_text)
        if detected:
            _set_cust(state, preferred_language=detected)
            state["session_language_locked"] = True
    _inject_instruction(llm_request, f"LANGUAGE: Respond only in {lang}.")

    return None

def _extract_last_user_text(contents) -> str:
    """Extract the most recent user utterance text."""
    for content in reversed(contents or []):
        if hasattr(content, 'role') and content.role == 'user':
            for part in (content.parts or []):
                if hasattr(part, 'text') and part.text:
                    return part.text
    return ""

def _inject_auth_context(state: dict[str, Any], llm_request) -> None:
    a = _auth(state)
    c = _cust(state)
    display_name = c.get("display_name", "") or _first_nonempty(state, "customer_display_name", "pref_name", "customer_name", "customer_first_name")
    inject_name = c.get("inject_preferred_name", "") or state.get("inject_preferred_name", "")
    # Fall back to the flat vars the page/AT STATE_MAP write, so a signed-in
    # session is never reported as auth_level=0 (which made the model re-identify).
    auth_level_str = a.get('level', '') or _first_nonempty(state, "auth_level") or '0'
    auth_mode_str = a.get('mode', '') or _first_nonempty(state, "auth_mode") or 'none'
    msg = (
        f"AUTH CONTEXT: auth_level={auth_level_str} | auth_mode={auth_mode_str} | "
        f"auth_locked={a.get('locked', False)} | step_up_required={a.get('step_up_required', False)}"
    )
    if display_name:
        msg += f" | customer_display_name={display_name}"
    if inject_name == "true":
        msg += f" | GREET CUSTOMER AS '{display_name}' — address them by this name"
    _cid = state.get("customer_id", "") or c.get("customer_id", "") or a.get("customer_id", "") or _first_nonempty(state, "customerId")
    if _cid and not state.get("customer_id"):
        state["customer_id"] = _cid
    try:
        _lvl_int = int(auth_level_str or "0")
        _identified = bool(_cid) and _lvl_int >= 1
    except Exception:
        _lvl_int = 0
        _identified = bool(_cid)
    if _identified:
        if _lvl_int >= 2:
            msg += (f" | AUTHENTICATED (L2): customer_id={_cid}. The customer is ALREADY signed in and verified at L2, "
                    f"and customer-data tools apply this id automatically (customerId={_cid}). "
                    f"Never look the customer up by phone number, never ask for an id or PIN for L1/L2 tools, "
                    f"and DO NOT call the identity hub unless a tool returns STEP_UP_REQUIRED for L3.")
        else:
            msg += (f" | IDENTIFIED: customer_id={_cid}. The customer is already identified and "
                    f"customer-data tools apply this id automatically (customerId={_cid}). "
                    f"Never look the customer up by phone number, never ask for an id, and do not "
                    f"call the identity hub just to learn it.")
    _inject_instruction(llm_request, msg)

def _inject_cie_context(state: dict[str, Any], llm_request) -> None:
    c = _cust(state)
    k = _cie(state)
    first_name = c.get("display_name", "") or _first_nonempty(state, "customer_display_name", "pref_name", "customer_name", "customer_first_name")
    segment = c.get("segment", "") or _first_nonempty(state, "customer_segment", "spending_persona")
    life_stage = k.get("life_stage", "")
    nba = k.get("next_best_action", "[]")
    nudge_allowed = state.get("nudge_allowed", False)
    open_apps = k.get("open_applications", "[]")
    _inject_instruction(llm_request,
        f"CUSTOMER CONTEXT: name={first_name} | segment={segment} | "
        f"life_stage={life_stage} | nudge_allowed={nudge_allowed} | "
        f"open_applications={open_apps} | next_best_action={str(nba)[:200]}")

def _compute_nudge_eligibility(state: dict[str, Any]) -> None:
    if (_cie(state).get("nba_suppressed") or
            _cie(state).get("nba_shown") or
            _cust(state).get("marketing_opt_out") or
            _cust(state).get("vulnerable_flag") or
            state.get("fraud_suspected")):
        state["nudge_allowed"] = False
    else:
        state["nudge_allowed"] = True

def _check_vulnerability(text: str, state: dict[str, Any]) -> None:
    VULNERABILITY_PATTERNS = re.compile(
        r'\b(bereaved?|bereavement|passed away|died|death|grieving|'
        r'mental health|dementia|confused|overwhelmed|distressed|'
        r'power of attorney|POA|estate|probate)\b',
        re.IGNORECASE
    )
    if VULNERABILITY_PATTERNS.search(text):
        _set_cust(state, vulnerable_flag=True)
        _set_cie(state, nba_suppressed=True)

def _is_small_talk(text: str) -> bool:
    SMALL_TALK = re.compile(
        r'^(hi|hello|hey|how are you|what\'s up|good morning|good afternoon|'
        r'good evening|thanks|thank you|bye|goodbye|ok|okay|sure|great|awesome)\W*$',
        re.IGNORECASE
    )
    return bool(SMALL_TALK.match(text.strip()))

def _detect_language(text: str) -> Optional[str]:
    FR_MARKERS = re.compile(
        r'\b(je|vous|merci|bonjour|s\'il vous plaît|mon compte|ma carte|'
        r'transfert|virement|solde|oui|non|je veux|je voudrais)\b',
        re.IGNORECASE
    )
    if FR_MARKERS.search(text):
        return "fr-CA"
    return None

def _inject_instruction(llm_request, text: str) -> None:
    """Prepend a system-level instruction to the LLM request."""
    try:
        if hasattr(llm_request, 'system_instruction') and llm_request.system_instruction:
            for part in (llm_request.system_instruction.parts or []):
                if hasattr(part, 'text'):
                    part.text = text + "\n\n" + part.text
                    return
    except Exception:
        pass

# --- Entry point ---
def before_model_callback(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    return before_model_callback_impl(callback_context, llm_request)
