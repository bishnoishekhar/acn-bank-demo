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

_ASKS_RATING_RE = re.compile(r'(how (would|did) you rate|rate (your|our|this|the) (experience|service|call|chat|visit|conversation)|\b(1|one)\s*(to|-|\u2013)\s*(5|five)\b|scale of)', re.IGNORECASE)

def _close_text(parts) -> str:
    return "".join((getattr(p, 'text', '') or '') for p in parts if getattr(p, 'text', None)).strip()

def _note_rating_asked(state, llm_response) -> None:
    """However the customer was asked for a rating, remember it so the close never asks twice."""
    try:
        spoken = _close_text(list(getattr(getattr(llm_response, 'content', None), 'parts', None) or []))
        if spoken and _ASKS_RATING_RE.search(spoken):
            csat = json.loads(state.get("csat", "{}") or "{}")
            if not csat.get('offered'):
                csat['offered'] = True
                state["csat"] = json.dumps(csat)
    except Exception:
        pass

def _enforce_session_close(state, llm_response) -> Optional[object]:
    """Never end the session silently. The recap, the rating question and the farewell have to be said by the MODEL
    (a voice session streams the model's words to the speaker before callbacks run, so text added here is never heard):
    before_tool answers a bare end_session with CLOSE_RATING / CLOSE_FAREWELL and sends the model back to say them.
    This only keeps the safety nets: handoff wording, 'asked and hung up in one go', and a fallback closing line."""
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

        csat = json.loads(state.get("csat", "{}") or "{}")
        rated = isinstance(params, dict) and params.get('csat_rating') not in (None, '')
        if not rated and not csat.get('offered'):
            if spoken and _ASKS_RATING_RE.search(spoken):
                # The model asked for the rating AND hung up in the same turn: keep the words, drop the hang-up.
                csat['offered'] = True
                state["csat"] = json.dumps(csat)
                return LlmResponse.from_parts(parts=[p for p in parts if p is not call])
            return None                      # before_tool: CLOSE_RATING
        if spoken:
            state['close_spoken'] = '1'
            return None
        if int(csat.get('gate_n', 0) or 0) >= 2:
            return LlmResponse.from_parts(parts=[Part.from_text(text=_CLOSING_TEXT)] + parts)
        return None                          # before_tool: CLOSE_FAREWELL
    except Exception:
        return None

# --- A widget never goes out alone (text channel) / speak-first gate (voice) ---
# TEXT: a reply that calls a widget but says nothing gets a spoken line in front of the call.
# VOICE: the platform streams the model's words to the speaker and the live transcript BEFORE after_model runs, so text
# added here is never spoken, and a widget ends the turn (nothing can be said after it). So in a voice session we only
# ARM a flag here; before_tool then sends the model back to say it first (SPEAK_FIRST).
_WIDGET_TOOL_NAMES = frozenset(['acn-amount-input', 'acn-credit-card-widget', 'acn-form-input', 'acn-insight-card', 'acn-nudge-card', 'acn-payee-selector', 'acn-payment-carousel', 'acn-payment-receipt', 'card_carousel', 'card_widget', 'epp_carousel', 'epp_plans', 'loan_preapproval', 'mobile_handoff', 'mortgage_affordability', 'mortgage_calculator', 'mortgage_kyc', 'mortgage_nudge', 'mortgage_rate_shelf', 'mortgage_rate_table', 'qr_widget', 'quick_actions'])
_FOLLOWUP_WIDGETS = frozenset(['card_carousel', 'card_widget', 'epp_carousel', 'epp_plans', 'mortgage_rate_shelf', 'mortgage_rate_table'])
_ADVICE_DISCLAIMER = ("I can provide information but not personalized financial advice. "
                      "Please consider consulting a financial advisor for your specific situation.")

_WIDGET_SPOKEN = {
    'card_carousel': _ADVICE_DISCLAIMER + " Here are our credit card options on your screen. Would you like more details on one of them, or should we check your eligibility?",
    'card_widget': "Here are the details for that card on your screen. Would you like to apply for it, or compare another card?",
    'mortgage_rate_table': _ADVICE_DISCLAIMER + " Here's where our rates sit today. Are you buying, renewing, or would you like to see what you could afford?",
    'mortgage_rate_shelf': _ADVICE_DISCLAIMER + " Here are our current mortgage rates on your screen. Which term interests you?",
    'epp_carousel': "Here are the payment plan options on your screen. Which plan would you like?",
    'epp_plans': "Here are the payment plan options on your screen. Which plan would you like?",
    'quick_actions': "Here are your options.",
    'acn-payee-selector': "Here are your saved payees on your screen. Who would you like to send money to?",
    'acn-payment-carousel': "Here is what I found on your screen.",
    'acn-amount-input': "How much would you like to send? You can enter it on your screen.",
    'acn-form-input': "Please fill in the details on your screen.",
    'acn-payment-receipt': "Here is your receipt on your screen.",
    'acn-insight-card': "Here is a quick insight on your screen.",
    'acn-credit-card-widget': "Here are your card details on your screen.",
    'acn-nudge-card': "I have one suggestion for you on your screen. Would you like to take a look?",
    'mortgage_nudge': "I have one suggestion for you on your screen. Would you like to take a look?",
    'mobile_handoff': "I've put a button on your screen so you can continue in the ACN Bank app, where you'll be signed in automatically. Is there anything else I can help with here?",
    'loan_preapproval': "Here is your pre-approval result on your screen. Would you like to continue in the ACN Bank app?",
    'mortgage_calculator': "Here is your payment estimate on your screen. Would you like to see today's rates, or start a pre-approval?",
    'mortgage_affordability': "Here is what you could afford on your screen. Would you like to see today's rates?",
    'mortgage_kyc': "Please complete the identity step on your screen when you're ready, and let me know once it's done.",
    'qr_widget': "Here is your QR code on your screen. It's valid until the expiry shown, and the payer can scan it with their banking app.",
}
_SUMMARY_WIDGETS = frozenset({'quick_actions', 'acn-payment-carousel', 'acn-payee-selector', 'acn-insight-card'})

def _is_voice_state(state):
    try:
        return 'VOICE' in str(state.get('_session', '')).upper()
    except Exception:
        return False

def _fresh_spoken_summary(state):
    try:
        import time
        raw = state.get('spoken_summary', '') or ''
        if raw:
            item = json.loads(raw)
            if time.time() - float(item.get('ts', 0)) <= 90:
                return str(item.get('text', '') or '')
    except Exception:
        pass
    return ''

def _first_widget_and_text(llm_response):
    parts = list(getattr(getattr(llm_response, 'content', None), 'parts', None) or [])
    spoken = " ".join((getattr(p, 'text', '') or '').strip() for p in parts if (getattr(p, 'text', '') or '').strip())
    widget = ''
    for p in parts:
        fc = getattr(p, 'function_call', None)
        name = str(getattr(fc, 'name', '') or '').split('/')[-1] if fc is not None else ''
        if name in _WIDGET_TOOL_NAMES:
            widget = name
            break
    return parts, widget, spoken

def _chip_labels(llm_response):
    """Labels of the quick_actions chips in this reply, so a chip row sent without words can be put into words."""
    try:
        for p in list(getattr(getattr(llm_response, 'content', None), 'parts', None) or []):
            fc = getattr(p, 'function_call', None)
            if fc is not None and str(getattr(fc, 'name', '') or '').split('/')[-1] == 'quick_actions':
                args = dict(getattr(fc, 'args', None) or {})
                payload = args.get('payload') if isinstance(args.get('payload'), dict) else args
                return [str(a.get('content', '')).strip() for a in (payload.get('actions') or [])
                        if isinstance(a, dict) and str(a.get('content', '')).strip()][:5]
    except Exception:
        pass
    return []

def _chip_sentence(labels):
    if not labels:
        return ''
    body = labels[0] if len(labels) == 1 else ", ".join(labels[:-1]) + " or " + labels[-1]
    return "I can help with: " + body + ". Which would you like?"

def _arm_speak_first(state, llm_response):
    """Voice only: remember that this reply's widget call needs the model to speak first."""
    try:
        if not _is_voice_state(state):
            state['speak_gate'] = ''
            return
        _parts, widget, spoken = _first_widget_and_text(llm_response)
        if not widget:
            state['speak_gate'] = ''
            if spoken:
                state['speak_gate_n'] = 0
            return
        if not spoken:
            state['speak_gate'] = 'silent:' + widget
            state['speak_gate_opts'] = '; '.join(_chip_labels(llm_response)) if widget == 'quick_actions' else ''
        elif widget in ('acn-payment-carousel', 'acn-payee-selector') and not any(ch.isdigit() for ch in spoken) and _fresh_spoken_summary(state):
            state['speak_gate'] = 'silent:' + widget      # a pacing phrase alone: the data the carousel shows was never said
            state['speak_gate_opts'] = ''
        elif widget in _FOLLOWUP_WIDGETS and '?' not in spoken:
            state['speak_gate'] = 'followup:' + widget
        else:
            state['speak_gate'] = ''
            state['speak_gate_n'] = 0
    except Exception:
        pass

def _ensure_spoken_with_widget(state, llm_response) -> Optional[object]:
    """TEXT channel: if the reply calls a widget but says nothing, add the spoken line in front of the call."""
    try:
        if _is_voice_state(state):
            return None  # voice: handled by the speak-first gate (text added here would never be spoken)
        parts, widget, spoken = _first_widget_and_text(llm_response)
        if spoken or not widget:
            return None
        text = ''
        if widget in _SUMMARY_WIDGETS:
            text = _fresh_spoken_summary(state)
            if text:
                state['spoken_summary'] = ''
        if not text and widget == 'quick_actions':
            text = _chip_sentence(_chip_labels(llm_response))
        text = text or _WIDGET_SPOKEN.get(widget) or "Here you go."
        return LlmResponse.from_parts(parts=[Part.from_text(text=text)] + parts)
    except Exception:
        return None

# --- Entry point ---
def _consume_pin_grant(state, llm_response):
    """One PIN covers ONE request: when the reply is final (no more tool work) the grant is spent, used or not."""
    try:
        if not state.get('pin_grant_ts'):
            return
        for p in list(getattr(getattr(llm_response, 'content', None), 'parts', None) or []):
            fc = getattr(p, 'function_call', None)
            if fc is None:
                continue
            name = str(getattr(fc, 'name', '') or '').split('/')[-1]
            if name not in _WIDGET_TOOL_NAMES and name != 'end_session':
                return                               # still working on the request (a tool call, a hand-over)
        state['pin_consumed_ts'] = state.get('pin_grant_ts')
        state['pin_grant_used'] = ''
    except Exception:
        pass

def after_model_callback(callback_context: CallbackContext, llm_response: LlmResponse) -> Optional[LlmResponse]:
    result = after_model_callback_impl(callback_context, llm_response)
    _arm_speak_first(callback_context.state, result if result is not None else llm_response)
    spoken = _ensure_spoken_with_widget(callback_context.state, result if result is not None else llm_response)
    if spoken is not None:
        result = spoken
    _note_rating_asked(callback_context.state, result if result is not None else llm_response)
    _consume_pin_grant(callback_context.state, result if result is not None else llm_response)
    closed = _enforce_session_close(callback_context.state, result if result is not None else llm_response)
    return closed if closed is not None else result
