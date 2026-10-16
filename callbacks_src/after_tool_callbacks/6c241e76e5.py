"""
ACN Bank CES Demo — Shared Callback Module
All GECX callbacks delegate here. Platform globals (CallbackContext, Content, Part,
LlmResponse, LlmRequest, Tool) are auto-provided at runtime — do NOT import them.
Everything else MUST be explicitly imported.
"""
import re
import json
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

logger = logging.getLogger(__name__)

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
    r'transfer(?:ring)? (?:you )?to|routing you to|sending you to|I\'ll transfer|'
    r'Connecting you to|connecting you to|passing you to|handing you (?:off|over)|'
    r'another agent|different agent|specialist agent)\b',
    re.IGNORECASE
)

PAN_PATTERN = re.compile(r'\b(\d{4})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})\b')
SIN_PATTERN = re.compile(r'\b\d{3}[- ]?\d{3}[- ]?\d{3}\b')
CVV_PATTERN = re.compile(r'\b(cvv|cvc|security code)[:\s]*\d{3,4}\b', re.IGNORECASE)
OTP_PATTERN = re.compile(r'\b(otp|one[- ]?time\s+(?:password|code|passcode))\b.*?(\d{4,8})\b', re.IGNORECASE)
ACCOUNT_NUMBER_PATTERN = re.compile(r'\b(\d{7,9}|\d{12,16})\b')

WIDGET_TYPES_REQUIRING_DISCLAIMER = {
    'card_carousel', 'mortgage_rate_shelf', 'loan_preapproval', 'card_widget'
}

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

TOOL_MIN_AUTH = {
    'getCustomer': 1,
    'getAccounts': 2,
    'getCards': 2,
    'getBeneficiaries': 2,
    'getBills': 2,
    'listCustomerTransactions': 2,
    'getConfig': 0,
    'getSecurity': 2,
    'queryCustomers': 1,
    'getFinancials': 2,
    'getTaxDocuments': 2,
    'createTransaction': 2,
    'updateTransaction': 2,
    'createRecurringSchedule': 2,
    'updateRecurringSchedule': 2,
    'cancelRecurringSchedule': 2,
    'listRecurringSchedules': 2,
    'updateAccount': 2,
    'updateBill': 2,
    'updateCard': 2,
    'addPayee': 2,
    'updatePayee': 2,
    'deletePayee': 2,
    'updateProfile': 2,
    'updateOverdraftProtection': 2,
    'createDispute': 2,
    'getDispute': 2,
    'updateDispute': 2,
    'createPADDispute': 2,
    'createActivationRequest': 2,
    'getActivationStatus': 2,
    'updateActivationRequest': 2,
    'createApplication': 2,
    'updateApplication': 2,
    'getApplicationStatus': 1,
    'queryApplications': 1,
    'persistApprovedCreditCardApplication': 2,
    'createLoanApplication': 2,
    'updateLoanApplication': 2,
    'queryLoanApplications': 1,
    'getMortgageDetails': 2,
    'createKycRequest': 2,
    'getKycStatus': 2,
    'writeKycRecord': 2,
    'createRedemption': 2,
    'getRewardsBalance': 1,
    'getRewardsHistory': 2,
    'getRedemptionStatus': 2,
    'createFXOrder': 2,
    'createFXDraft': 2,
    'getFXOrderStatus': 2,
    'getExchangeRate': 0,
    'createStopPayment': 2,
    'getStopPaymentStatus': 2,
    'createChequeBookOrder': 2,
    'createBankDraft': 2,
    'getOverdraftDetails': 2,
    'listPADs': 2,
    'cancelPAD': 2,
    'getNSFHistory': 2,
    'createNSFReversal': 2,
    'getAvailableSlots': 1,
    'createAppointment': 2,
    'getAppointment': 2,
    'updateAppointment': 2,
    'cancelAppointment': 2,
    'getPreferences': 2,
    'updateNotificationPreferences': 2,
    'updatePaperlessEnrollment': 2,
    'updateMarketingConsent': 2,
    'getCASLConsent': 2,
    'getCustomerSegment': 1,
    'getNextBestActions': 1,
    'logNudgeShown': 1,
    'searchFAQs': 0,
    'getFAQ': 0,
    'listFAQCategories': 0,
    'getInvestmentAccounts': 2,
    'getGICRates': 0,
    'getContributionRoom': 2,
    'getInvestmentHoldings': 2,
    'getAccountProducts': 0,
    'createAccountApplication': 1,
    'getAccountApplicationStatus': 1,
    'updateAccountApplication': 2,
    'executeACNBankApplicationEmail': 2,
    # --- auth-deadlock fix: tools previously falling through to default=2 ---
    'acn_identity_security_hub':        0,  # call_identity_hub — GRANTS L2; must be callable pre-auth
    'end_session':                      0,  # session control
    'quick_actions':                    0,  # UI chips
    'format_for_tts':                   0,  # text shaping
    'business_hours_check':             0,  # public
    'acn_faq_knowledge':                0,  # public FAQ
    'acn_customer_intelligence_engine': 1,  # needs identity only
    'ccaas_handoff':                    0,  # escalation path — never gate
    'ccaas_create_case':                0,  # escalation path — never gate
    'ccaas_schedule_callback':          0,  # escalation path — never gate
    'identify_customer':                0,  # L0 -> L1
    'record_auth_event':                0,  # audit log
    'issue_otp':                        0,  # BT-1 gates
    'verify_otp':                       0,  # BT-1 gates
    'verify_pin':                       0,  # BT-1 gates
    'authorize_step_up':                0,  # grants L3
    'request_app_push_approval':        1,  # L3 step-up, needs L1
    'acn-form-input':                   0,  # widget render
    'acn-amount-input':                 0,  # widget render
    'acn-insight-card':                 0,  # widget render
    'acn-nudge-card':                   0,  # widget render
    'acn-credit-card-widget':           0,  # widget render
    'acn-payee-selector':               0,  # widget render
    'acn-payment-carousel':             0,  # widget render
    'acn-payment-receipt':              0,  # widget render
    'card_widget':                      0,  # widget render
    'card_carousel':                    0,  # widget render
    'epp_carousel':                     0,  # widget render
    'qr_widget':                        0,  # widget render
    'mortgage_rate_board':              0,  # public rates
    'mortgage_rate_shelf':              0,  # public rates
    'mortgage_rate_table':              0,  # public rates
    'epp_product_catalog':              0,  # public catalog
    'epp_plans':                        0,  # public catalog
    'mortgage_calculator':              0,  # pure calc
    'calculate_mortgage_payment':       0,  # pure calc
    'mortgage_payment_estimate':        0,  # pure calc
    'calculate_affordability':          0,  # pure calc
    'mortgage_affordability':           0,  # pure calc
    'mortgage_affordability_estimate':  0,  # pure calc
    'calculate_loan_payment':           0,  # pure calc
    'calculate_epp_plans':              0,  # pure calc
    'epp_plan_calculator':              0,  # pure calc
    'mobile_handoff':                   1,  # needs identity
    'mortgage_kyc':                     1,  # needs identity
    'loan_preapproval':                 1,  # needs identity
    'mortgage_preapproval_check':       1,  # needs identity
    'mortgage_next_best_action':        1,  # needs identity
    'mortgage_nudge':                   1,  # needs identity
    'docai_document_processors':        1,  # needs identity
    'docai_drivers_license':            1,  # needs identity
    'fintrac_precheck':                 1,  # needs identity
    'evaluate_credit_policy':           1,  # needs identity
    'build_spend_plan':                 1,  # needs identity
    'build_trip_plan':                  1,  # needs identity
    'compute_spending_insights':        2,  # customer txn data
    'qr_decode_payment':                2,  # money movement
    'qr_generate_request':              2,  # money movement
    'set_card_pin':                     3,  # sensitive write — requires step-up
    # agentTool resource-ID aliases (name != displayName)
    'call_identity_hub': 0,  # alias of acn_identity_security_hub
    'call_faq':          0,  # alias of acn_faq_knowledge
    'call_cie':          1,  # alias of acn_customer_intelligence_engine
}

STEP_UP_OPS = {
    'addPayee', 'updatePayee', 'deletePayee', 'updateProfile',
    'createFXOrder', 'createFXDraft', 'updateActivationRequest',
    'persistApprovedCreditCardApplication',
}

# Wire transfers always require step-up regardless of amount (DEV-012)
WIRE_TOOL_NAMES = {'createTransaction'}

# BT-3b: consecutive auth-blocks on one tool before aborting the retry loop.
AUTH_BLOCK_MAX = 3

HIGH_RISK_AMOUNT_THRESHOLD = 1000  # CAD — demo override (PRD v2.4 A2.4-02; production default is 3000)


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
# BA: before_agent_callback
# ---------------------------------------------------------------------------

def before_agent_callback_impl(callback_context) -> Optional[object]:
    """
    BA-1 through BA-4 + voice_name_confirmation.
    CRITICAL: Must guard with channel_locked check to prevent re-running.
    """
    state = callback_context.state

    # BA-2: Idle expiry — run every turn regardless of channel_locked
    now_iso = datetime.now(timezone.utc).isoformat()
    auth_expires_at = _auth(state).get("expires_at", "")
    if auth_expires_at:
        try:
            expires = datetime.fromisoformat(auth_expires_at)
            auth_level = int(_auth(state).get("level", "0") or "0")
            if datetime.now(timezone.utc) > expires and auth_level >= 2:
                _set_auth(state, level="1")
                logger.info("auth_expired: dropped to L1")
        except (ValueError, TypeError):
            pass

    # BA-3: Step-up expiry
    step_up_valid_until = _auth(state).get("step_up_valid_until", "")
    if step_up_valid_until:
        try:
            step_up_expires = datetime.fromisoformat(step_up_valid_until)
            if datetime.now(timezone.utc) > step_up_expires:
                auth_level = int(_auth(state).get("level", "0") or "0")
                _set_auth(state, level=str(min(auth_level, 2)),
                          step_up_action_hash="", step_up_valid_until="")
        except (ValueError, TypeError):
            pass

    # BA-4: Turn counter + activity timestamp
    turn_count = int(_cnt(state).get("turns", "0") or "0")
    _set_cnt(state, turns=str(turn_count + 1))
    expires_dt = datetime.now(timezone.utc) + timedelta(seconds=900)
    _set_auth(state, last_activity=now_iso, expires_at=expires_dt.isoformat())

    # BA-0: Bridge flat session variables into the JSON groups the model-side
    # injectors read. Runs every turn -- the page can sign a customer in
    # mid-session, and AT STATE_MAP writes flat keys after every tool call.
    _seed_identity_from_session(state)

    # BA-1: Session init — only once (guarded by channel_locked)
    if not state.get("channel_locked"):
        # Detect channel
        if state.get("telephony_caller_id"):
            state["channel"] = "voice"
        elif state.get("whatsapp_wa_id"):
            state["channel"] = "whatsapp"
        else:
            state["channel"] = "webchat"

        state["channel_locked"] = True
        state["widgets_enabled"] = (state["channel"] == "webchat")
        state["dtmf_enabled"] = False

        # Load after_hours
        _compute_after_hours(state)

    return None


def _compute_after_hours(state: dict[str, Any]) -> None:
    """Compute after_hours based on America/Toronto business hours."""
    try:
        from datetime import datetime
        import zoneinfo
        tz = zoneinfo.ZoneInfo("America/Toronto")
        now_local = datetime.now(tz)
        hour = now_local.hour
        weekday = now_local.weekday()  # 0=Monday, 6=Sunday
        if weekday >= 5:  # Weekend
            state["after_hours"] = True
        elif hour < 8 or hour >= 20:  # Before 8am or after 8pm
            state["after_hours"] = True
        else:
            state["after_hours"] = False
    except Exception:
        state["after_hours"] = False


# ---------------------------------------------------------------------------
# BM: before_model_callback
# ---------------------------------------------------------------------------

def before_model_callback_impl(callback_context, llm_request) -> Optional[object]:
    """
    BM-1 through BM-14 safety, auth, CIE injection, language lock.
    Returns None to allow LLM to proceed; returns LlmResponse to short-circuit.
    """
    state = callback_context.state
    contents = llm_request.contents if hasattr(llm_request, 'contents') else []

    # Extract latest user utterance
    user_text = _extract_last_user_text(contents)

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
    level = a.get('level', '') or _first_nonempty(state, "auth_level") or '0'
    mode = a.get('mode', '') or _first_nonempty(state, "auth_mode") or 'none'
    _inject_instruction(llm_request,
        f"AUTH CONTEXT: auth_level={level} | auth_mode={mode} | "
        f"auth_locked={a.get('locked', False)} | step_up_required={a.get('step_up_required', False)}")


def _inject_cie_context(state: dict[str, Any], llm_request) -> None:
    c = _cust(state)
    k = _cie(state)
    first_name = c.get("first_name", "") or _first_nonempty(state, "customer_first_name", "pref_name")
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


# ---------------------------------------------------------------------------
# AM: after_model_callback
# ---------------------------------------------------------------------------

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
# BT: before_tool_callback
# ---------------------------------------------------------------------------

def before_tool_callback_impl(tool, input_dict: dict[str, Any], callback_context) -> Optional[dict[str, Any]]:
    """
    BT-1 through BT-11.
    Returns dict to override tool input, or None to proceed normally.
    Returning a dict with 'error' key blocks the tool call.
    """
    state = callback_context.state
    tool_name = tool.name if hasattr(tool, 'name') else str(tool)

    # BT-9: Mock mode — compare as string; "false" must not evaluate as truthy
    if str(state.get("mock_mode", "")).lower() == "true":
        return _get_mock_response(tool_name, input_dict, state)

    # A tool declared level 0 in TOOL_MIN_AUTH (public rates, pure calculators)
    # needs no customer identity, so lacking customer_id must not block it.
    # Without this, BT-1 ran ahead of BT-3 and rejected tools the policy map
    # explicitly marks "0  # public rates" with AUTH_LEVEL_INSUFFICIENT. The
    # model then re-planned against a misleading error, costing extra ~19.5k-token
    # LLM round trips per turn and inventing tool arguments it was never given.
    # BT-1: Trusted ID injection
    customer_id = state.get("customer_id", "")
    if not customer_id and TOOL_MIN_AUTH.get(tool_name, 2) > 0 and tool_name not in {
        'identify_customer', 'authenticate', 'authorize_step_up',
        # agent-tools that establish identity must run before customer_id exists
        'acn_identity_security_hub', 'call_identity_hub',
        'acn_faq_knowledge', 'call_faq',
        'transfer_to_agent', 'end_session', 'business_hours_check', 'format_for_tts', 'getConfig',
        'searchFAQs', 'getFAQ', 'listFAQCategories',
        'getExchangeRate', 'getGICRates', 'getAccountProducts'
    }:
        # BT-1b: identity-retry loop breaker, the mirror of BT-3b below. BT-1
        # returns before BT-3 is ever reached, so without its own strike count a
        # tool blocked for a missing customer_id retries unboundedly, burns the
        # per-minute model quota and surfaces as RESOURCE_EXHAUSTED. This is the
        # loop that survives even when auth "succeeds": the identity hub runs as
        # an AgentTool in its own sub-session, so its customer_id never reaches
        # this session and every customer-data tool keeps failing here.
        cnt = _cnt(state)
        same = cnt.get("id_block_tool", "") == tool_name
        strikes = (int(cnt.get("id_block_count", "0") or "0") + 1) if same else 1
        _set_cnt(state, id_block_count=str(strikes), id_block_tool=tool_name)
        logger.warning(
            f"BT-1 BLOCKED: {tool_name} — customer_id not set (strike {strikes})"
        )
        if strikes >= AUTH_BLOCK_MAX:
            logger.error(
                f"BT-1b IDENTITY LOOP ABORTED: {tool_name} blocked {strikes}x "
                f"with no customer_id in session"
            )
            if not state.get("escalation_reason"):
                state["escalation_reason"] = "identity_loop"
            return {
                "error": "IDENTITY_LOOP_ABORTED",
                "message": (
                    f"'{tool_name}' has been blocked {strikes} times because no "
                    f"customer is identified in this session. STOP calling this tool "
                    f"and STOP re-requesting the phone number, PIN or OTP. Tell the "
                    f"customer you cannot complete this step right now and offer a "
                    f"live agent."
                ),
            }
        return {"error": "AUTH_LEVEL_INSUFFICIENT", "message": "Please identify yourself first."}

    # BT-10: Firestore query guard — check BEFORE overwriting customerId
    if 'customerId' in input_dict and input_dict.get('customerId') != customer_id:
        logger.warning(f"BT-10 BLOCKED: customerId mismatch in {tool_name}")
        return {"error": "OWNERSHIP_VIOLATION", "message": "Access denied."}

    if customer_id:
        input_dict['customerId'] = customer_id
    if 'limit' in input_dict:
        input_dict['limit'] = min(int(input_dict.get('limit', 50) or 50), 50)

    # BT-3: Auth level check
    auth_level = int(_auth(state).get("level", "0") or "0")
    required = TOOL_MIN_AUTH.get(tool_name, 2)
    if auth_level < required:
        # BT-3b: auth-retry loop breaker. A blocked tool makes the model try to
        # authenticate; if the auth path is itself blocked, that retry is blocked
        # too -- an unbounded loop that burns the per-minute model quota and
        # surfaces to the caller as RESOURCE_EXHAUSTED. Escalate, don't spin.
        cnt = _cnt(state)
        same = cnt.get("auth_block_tool", "") == tool_name
        strikes = (int(cnt.get("auth_block_count", "0") or "0") + 1) if same else 1
        _set_cnt(state, auth_block_count=str(strikes), auth_block_tool=tool_name)
        if strikes >= AUTH_BLOCK_MAX:
            logger.error(
                f"BT-3b AUTH LOOP ABORTED: {tool_name} blocked {strikes}x at "
                f"level {auth_level} (needs {required})"
            )
            if not state.get("escalation_reason"):
                state["escalation_reason"] = "auth_loop"
            return {
                "error": "AUTH_LOOP_ABORTED",
                "message": (
                    f"'{tool_name}' has been blocked {strikes} times at auth level "
                    f"{auth_level} (needs {required}). STOP calling this tool and STOP "
                    f"re-requesting the PIN or OTP. Tell the customer verification "
                    f"cannot be completed right now and offer a live agent."
                ),
            }
        return {
            "error": "AUTH_LEVEL_INSUFFICIENT",
            "message": f"Auth level {required} required. Current level: {auth_level}."
        }
    if _cnt(state).get("auth_block_count", "0") not in ("", "0"):
        _set_cnt(state, auth_block_count="0", auth_block_tool="")
    if _cnt(state).get("id_block_count", "0") not in ("", "0"):
        _set_cnt(state, id_block_count="0", id_block_tool="")

    # BT-4: Step-up enforcement
    if tool_name in STEP_UP_OPS:
        if auth_level < 3 or not _auth(state).get("step_up_action_hash"):
            step_up_reason = _map_step_up_reason(tool_name)
            _set_auth(state, step_up_required=True, step_up_reason=step_up_reason)
            return {
                "error": "STEP_UP_REQUIRED",
                "message": f"Additional verification required: {step_up_reason}.",
                "step_up_reason": step_up_reason
            }

    # BT-7: Payment limits
    if tool_name == 'createTransaction':
        amount_str = str(input_dict.get('amount', '0') or '0')
        try:
            amount = float(amount_str.replace(',', ''))
            if amount >= HIGH_RISK_AMOUNT_THRESHOLD and auth_level < 3:
                _set_auth(state, step_up_required=True, step_up_reason="threshold")
                return {
                    "error": "STEP_UP_REQUIRED",
                    "message": f"Payments of CAD {HIGH_RISK_AMOUNT_THRESHOLD}+ require additional verification.",
                    "step_up_reason": "threshold"
                }
        except (ValueError, TypeError):
            pass

    # BT-8: FINTRAC pre-check
    if tool_name in {'createTransaction'} and input_dict.get('transaction_type') == 'wire':
        if not _txn(state).get("wire_disclosure_ack"):
            return {"error": "WIRE_DISCLOSURE_REQUIRED", "message": "Wire disclosure acknowledgment required."}
        fintrac_status = _txn(state).get("fintrac_check_status", "")
        if fintrac_status == "blocked":
            return {"error": "FINTRAC_BLOCKED", "message": "Transaction flagged for regulatory review."}
        if fintrac_status == "review_required":
            state["escalation_reason"] = "fintrac_review"
            return {"error": "FINTRAC_REVIEW", "message": "Transaction requires manual review."}

    # BT-5: Confirmation gate
    MONEY_MOVEMENT_TOOLS = {'createTransaction', 'createRedemption', 'createFXOrder',
                             'createStopPayment', 'createBankDraft', 'createNSFReversal',
                             'cancelPAD', 'persistApprovedCreditCardApplication'}
    if tool_name in MONEY_MOVEMENT_TOOLS:
        if not _txn(state).get("awaiting_confirmation"):
            return {
                "error": "CONFIRMATION_REQUIRED",
                "message": "Please confirm the details with the customer before executing."
            }

    # BT-6: Idempotency key
    if tool_name in MONEY_MOVEMENT_TOOLS:
        if not _txn(state).get("idempotency_key"):
            action_hash = hashlib.sha256(
                json.dumps(input_dict, sort_keys=True).encode()
            ).hexdigest()[:16]
            _set_txn(state, idempotency_key=f"idp-{action_hash}")
        input_dict['idempotencyKey'] = _txn(state)["idempotency_key"]

    return None


def _map_step_up_reason(tool_name: str) -> str:
    MAP = {
        'addPayee': 'new_payee',
        'updatePayee': 'payee_edit',
        'deletePayee': 'payee_edit',
        'updateProfile': 'contact_change',
        'createFXOrder': 'wire',
        'createFXDraft': 'wire',
        'updateActivationRequest': 'limit_increase',
        'persistApprovedCreditCardApplication': 'threshold',
    }
    return MAP.get(tool_name, 'threshold')


def _get_mock_response(tool_name: str, input_dict: dict[str, Any], state: dict[str, Any]) -> dict:
    """Return deterministic mock fixtures for demo mode."""
    customer_id = state.get("customer_id", "CUST_DOC_1988")
    # Answer as whoever the page actually signed in. Hardcoding a name here
    # is what made unrelated sessions come back as "Chander".
    _c = _cust(state)
    _mock_pref = (_c.get("display_name") or _c.get("first_name")
                  or _first_nonempty(state, "customer_display_name", "pref_name",
                                     "customer_first_name") or "Chander")
    _mock_legal = (_first_nonempty(state, "customer_name")
                   or " ".join(x for x in (_c.get("first_name"), _c.get("last_name")) if x)
                   or "Chander Bishnoi")
    MOCK_FIXTURES = {
        'getCustomer': {
            "status": "success",
            "data": {
                "customer_id":       customer_id,
                "preferred_name":    _mock_pref,
                "legal_name":        _mock_legal,
                "display_name":      _mock_pref,
                "email":             "c****@accenture.com",
                "registered_mobile": "+1226***4374",
                "segment":           "mass_market",
                "customer_tier":     "mass_market",
                "member_since":      "2019-03-15",
                "vulnerability_flag": False,
                "marketing_opt_out":  False,
                "preferred_language": "en",
            }
        },
        'getAccounts': {
            "status": "success",
            "data": [
                {"accountId": "ACC-001", "type": "chequing", "balance": 4250.75, "currency": "CAD"},
                {"accountId": "ACC-002", "type": "savings", "balance": 12800.00, "currency": "CAD"}
            ]
        },
        'getCards': {
            "status": "success",
            "data": [
                {"cardId": "CRD-001", "last4": "4521", "type": "Visa Infinite", "status": "active"},
            ]
        },
        'listCustomerTransactions': {
            "status": "success",
            "data": [
                {"txnId": "TXN-001", "date": "2026-09-28", "amount": -45.67, "merchant": "Tim Hortons", "category": "food"},
                {"txnId": "TXN-002", "date": "2026-09-27", "amount": -120.00, "merchant": "Groceries", "category": "groceries"},
                {"txnId": "TXN-003", "date": "2026-09-26", "amount": 2500.00, "merchant": "Payroll", "category": "income"},
            ]
        },
        'getConfig': {
            "status": "success",
            "data": {
                "mortgage_rates": {"5yr_fixed": 4.99, "3yr_variable": 5.25},
                "business_hours": {"weekday": "08:00-20:00", "weekend": "closed"},
                "agent_policy": {"step_up_payment_threshold_cad": 1000}
            }
        },
        'identify_customer': {
            "status": "success",
            "auth_level": 1,
            "customer_id": customer_id,
            "identified_by": "caller_id"
        },
        'authenticate': {
            "status": "success",
            "auth_level": 2,
            "auth_mode": "pin"
        },
        'getExchangeRate': {
            "status": "success",
            "data": {"pair": "CAD/USD", "rate": 0.7312, "indicative": True}
        },
        'searchFAQs': {
            "status": "success",
            "data": [{"faqId": "FAQ-001", "question": "How do I reset my PIN?", "answer": "Visit any ACN Bank branch or call us."}]
        },
    }
    return MOCK_FIXTURES.get(tool_name, {"status": "success", "data": {}, "mock": True})


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
