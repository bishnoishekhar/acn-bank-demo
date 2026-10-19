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

# The hub reports what it established to its caller through this trailer (see
# instruction.txt). It must survive intact, and must always be present.
_AUTH_TRAILER_RE = re.compile(r'\[\[AUTH_RESULT[^\]]*\]\]')

# What Gemini says by itself when a tool step errors and it has nothing to report.
_HUB_FILLER_RE = re.compile(r"having trouble with that|try (it )?again\?", re.IGNORECASE)

def _hub_state_val(state, *keys) -> str:
    for k in keys:
        v = state.get(k)
        if v not in (None, "", "null"):
            return str(v)
    return "-"

def _hub_trailer(state) -> str:
    """Build the trailer from what the hub's tools actually set in state."""
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

        # Lift the AUTH_RESULT trailer out so the scrubbers below (notably the voice
        # markdown strip, which deletes [ and ]) cannot corrupt it; re-attached after.
        trailer = ""
        _m = _AUTH_TRAILER_RE.search(text)
        if _m:
            text = text.replace(_m.group(0), "")
            trailer = _hub_trailer(state) if _hub_state_val(state, "customer_id", "customerId") != "-" else _m.group(0)

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

        part.text = (text.rstrip() + " " + trailer).strip() if trailer else text

    # AM-HUB: a final answer (no tool call) must always carry the trailer. After a
    # tool step errors the model tends to answer with "Hmm, I'm having trouble with
    # that. Do you want me to try again?"; CES hands that straight to the caller, which
    # then apologises and retries. Replace it with the real, state-derived result.
    try:
        parts = llm_response.content.parts or []
        if not any(getattr(p, 'function_call', None) for p in parts):
            full = "".join((p.text or "") for p in parts if getattr(p, 'text', None))
            if not _AUTH_TRAILER_RE.search(full):
                trailer = _hub_trailer(state)
                if not full.strip() or _HUB_FILLER_RE.search(full):
                    return LlmResponse.from_parts(parts=[Part.from_text(text=trailer)])
                for p in reversed(parts):
                    if getattr(p, 'text', None):
                        p.text = p.text.rstrip() + " " + trailer
                        break
    except Exception:
        pass

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

# --- Entry point ---
def after_model_callback(callback_context: CallbackContext, llm_response: LlmResponse) -> Optional[LlmResponse]:
    return after_model_callback_impl(callback_context, llm_response)
