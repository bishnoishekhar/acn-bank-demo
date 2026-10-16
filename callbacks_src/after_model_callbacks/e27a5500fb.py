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

AGENT_NAME_PATTERNS = re.compile(
    r'\b(acn_lead_orchestrator|acn_banking_hub|acn_products_hub|acn_service_hub|'
    r'acn_accounts_insights|acn_payments|acn_card_management|acn_offers_nudge|'
    r'acn_payee_management|acn_rewards_loyalty|acn_cheque_services|acn_overdraft_nsf|'
    r'acn_pad_management|acn_foreign_exchange|acn_credit_cards|acn_cc_kyc|'
    r'acn_cc_verification|acn_cc_credit_decision|acn_mortgage_application|'
    r'acn_loans_epp|acn_trip_lifestyle|acn_investments_registered|acn_account_opening|'
    r'acn_disputes|acn_digital_activation|acn_exception_escalation|'
    r'acn_branch_appointments|acn_customer_preferences|acn_customer_intelligence_engine|'
    r'acn_faq_knowledge|acn_identity_security_hub|'
    r'Banking Hub|Products Hub|Service Hub|Identity Hub|Accounts Hub|'
    r'Payments Agent|Credit Cards? Agent|Cards? Agent|Service Agent|'
    r'transfer(?:ring)? you to|routing you to|sending you to|I\'ll transfer you|'
    r'Connecting you to|connecting you to|passing you to|handing you (?:off|over)|'
    r'another agent|different agent|specialist agent)\b',
    re.IGNORECASE
)

PAN_PATTERN = re.compile(r'\b(\d{4})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})\b')

SIN_PATTERN = re.compile(r'\b\d{3}[- ]?\d{3}[- ]?\d{3}\b')

CVV_PATTERN = re.compile(r'\b(cvv|cvc|security code)[:\s]*\d{3,4}\b', re.IGNORECASE)

OTP_PATTERN = re.compile(r'\b(otp|one[- ]?time\s+(?:password|code|passcode))\b.*?(\d{4,8})\b', re.IGNORECASE)

ACCOUNT_NUMBER_PATTERN = re.compile(r'\b(\d{7,9}|\d{12,16})\b')

def _cnt(state):   return json.loads(state.get("session_counters",    "{}") or "{}")

def _set_cnt(state,  **kw): c=_cnt(state);  c.update(kw); state["session_counters"]   = json.dumps(c)

# ---------------------------------------------------------------------------
# AM: after_model_callback
# ---------------------------------------------------------------------------
_OTP_WORDING = re.compile(r'(?i)\bverif(?:y|ying) your (?:one-time |verification )?(?:code|passcode)\b')

def after_model_callback_impl(callback_context, llm_response) -> Optional[object]:
    """
    AM-1 through AM-12 + social-eng + agent-name-strip.
    Returns modified LlmResponse or None.
    """
    state = callback_context.state
    channel = state.get("channel", "webchat")

    if not llm_response or not getattr(llm_response, 'content', None):
        return None

    for part in (llm_response.content.parts or []):
        if not part.text:
            continue

        text = part.text

        # AM-6: PII scrubber
        text = PAN_PATTERN.sub(lambda m: f"•••• {m.group(4)}", text)
        text = SIN_PATTERN.sub("[SIN REMOVED]", text)
        text = ACCOUNT_NUMBER_PATTERN.sub("[ACCOUNT REMOVED]", text)
        text = CVV_PATTERN.sub("[SECURITY CODE REMOVED]", text)
        text = OTP_PATTERN.sub("[CODE REMOVED]", text)

        # AM-12: Voice markdown stripping
        if channel == "voice":
            text = re.sub(r'[*_`#\[\]{}|]', '', text)
            text = re.sub(r'\n+', ' ', text)

        # AM-agent-name-strip: Remove agent names
        text = AGENT_NAME_PATTERNS.sub('our team', text)
        text = _OTP_WORDING.sub('Verifying your PIN', text)

        # AM-11: Counter updates
        _update_counters(text, state)

        part.text = text

    return llm_response

def _update_counters(text: str, state: dict[str, Any]) -> None:
    NO_MATCH_INDICATORS = re.compile(
        r"(I'm not sure|I don't understand|could you clarify|"
        r"I couldn't find|unable to help with that)",
        re.IGNORECASE
    )
    if NO_MATCH_INDICATORS.search(text):
        no_match = int(_cnt(state).get("no_match", "0") or "0") + 1
        retry   = int(_cnt(state).get("retry_strikes", "0") or "0") + 1
        _set_cnt(state, no_match=str(no_match), retry_strikes=str(retry))
    else:
        _set_cnt(state, retry_strikes="0")

# ---------------------------------------------------------------------------
# AM-CLOSE: never end a session silently (TDD GB-42, "M0-enforced; deterministic").
# No instruction told the model how to close a session, so it called end_session
# straight away: customers were dropped with no explanation (after a failed PIN,
# on "goodbye", ...). The platform template for this tool says the same thing:
# always include text with end_session.
# ---------------------------------------------------------------------------
_CSAT_PROMPT = "Before you go, how would you rate your experience today, from 1 to 5?"
_CLOSING_TEXT = "Thanks for banking with ACN Bank. Take care!"
_HANDOFF_TEXT = ("I'm going to connect you with a specialist who can help from here. "
                 "Thank you for your patience.")
_HANDOFF_AUTH_TEXT = ("I wasn't able to verify your identity, so I'm going to connect you "
                      "with a specialist who can help from here. Thank you for your patience.")
_AUTH_REASON_RE = re.compile(r'\b(pin|authenticat\w*|verif\w*|identity|identif\w*)\b', re.IGNORECASE)
_ASKS_RATING_RE = re.compile(r'\b(rate|rating)\b|\b1\s*(to|-|–)\s*5\b|scale of', re.IGNORECASE)

def _close_text(parts) -> str:
    return "".join((getattr(p, 'text', '') or '') for p in parts if getattr(p, 'text', None)).strip()

def _enforce_session_close(state, llm_response) -> Optional[object]:
    """Return a replacement LlmResponse when end_session would end the call silently."""
    try:
        parts = list(getattr(getattr(llm_response, 'content', None), 'parts', None) or [])
        call = None
        for p in parts:
            fc = getattr(p, 'function_call', None)
            if fc is not None and getattr(fc, 'name', '') == 'end_session':
                call = p
                break
        if call is None:
            return None

        args = dict(getattr(call.function_call, 'args', None) or {})
        params = args.get('params') or {}
        spoken = _close_text(parts)

        if str(args.get('session_escalated', '')).strip().lower() in ('true', '1', 'yes'):
            if spoken:
                return None
            why = f"{args.get('reason', '')} {state.get('escalation_reason', '')}"
            text = _HANDOFF_AUTH_TEXT if _AUTH_REASON_RE.search(why) else _HANDOFF_TEXT
            return LlmResponse.from_parts(parts=[Part.from_text(text=text)] + parts)

        # Normal close: ask for the CSAT rating once, then end.
        csat = json.loads(state.get("csat", "{}") or "{}")
        rated = isinstance(params, dict) and params.get('csat_rating') not in (None, '')
        if not rated and not csat.get('offered'):
            csat['offered'] = True
            state["csat"] = json.dumps(csat)
            if spoken and _ASKS_RATING_RE.search(spoken):
                # The model asked for the rating AND hung up in the same turn.
                return LlmResponse.from_parts(parts=[p for p in parts if p is not call])
            return LlmResponse.from_parts(parts=[Part.from_text(text=_CSAT_PROMPT)])
        if spoken:
            return None
        return LlmResponse.from_parts(parts=[Part.from_text(text=_CLOSING_TEXT)] + parts)
    except Exception:
        return None  # never break the turn over a closing line

# --- Entry point ---
def after_model_callback(callback_context: CallbackContext, llm_response: LlmResponse) -> Optional[LlmResponse]:
    result = after_model_callback_impl(callback_context, llm_response)
    closed = _enforce_session_close(callback_context.state, result if result is not None else llm_response)
    return closed if closed is not None else result
