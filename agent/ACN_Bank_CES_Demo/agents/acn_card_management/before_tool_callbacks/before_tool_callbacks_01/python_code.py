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

import hashlib

import logging

from typing import Any, Optional

logger = logging.getLogger(__name__)

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

# BT-3b: consecutive auth-blocks on one tool before aborting the retry loop.
AUTH_BLOCK_MAX = 3

HIGH_RISK_AMOUNT_THRESHOLD = 1000

# ── JSON group helpers ──────────────────────────────────────────────────────
def _auth(state):  return json.loads(state.get("auth_state",          "{}") or "{}")

def _cust(state):  return json.loads(state.get("customer_profile",    "{}") or "{}")

def _txn(state):   return json.loads(state.get("transaction_context", "{}") or "{}")

def _cnt(state):   return json.loads(state.get("session_counters",    "{}") or "{}")

def _set_auth(state, **kw): a=_auth(state); a.update(kw); state["auth_state"]          = json.dumps(a)

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
        logger.warning(f"BT-1 BLOCKED: {tool_name} — customer_id not set")
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
                {
                    "account_id": "ACC-1988-CHQ-001", "type": "chequing",
                    "nickname": "Everyday Chequing", "balance": 3842.17,
                    "available_balance": 3342.17, "hold_amount": 500,
                    "currency": "CAD", "status": "active", "last4": "4374",
                    "overdraft_enabled": True, "overdraft_limit": 500,
                    "opened_date": "2019-03-15",
                },
                {
                    "account_id": "ACC-1988-SAV-001", "type": "savings",
                    "nickname": "Emergency Fund", "balance": 12540.00,
                    "available_balance": 12540.00, "hold_amount": 0,
                    "currency": "CAD", "status": "active", "last4": "7821",
                    "interest_rate": 4.25, "opened_date": "2019-03-15",
                },
            ]
        },
        'getCards': {
            "status": "success",
            "data": [
                {
                    "card_id": "CARD-1988-001", "type": "Debit", "network": "Visa",
                    "last_four": "7731", "expiry": "08/29", "status": "active",
                    "account_id": "ACC-1988-CHQ-001",
                },
                {
                    "card_id": "CARD_8d87590249", "card_type": "ACN Infinite Travel Visa",
                    "last4": "8842", "expiry_date": "12/28",
                    "status": "ready_for_activation", "available_credit": 10000,
                    "credit_limit": 10000, "outstanding_balance": 0, "is_latest": True,
                },
            ]
        },
        'listCustomerTransactions': {
            "status": "success",
            "data": [
                {
                    "transaction_id": "TXN-1988-001", "type": "debit", "amount": -45.67,
                    "merchant_name": "Tim Hortons", "category": "dining",
                    "status": "settled", "timestamp": "2026-09-28T10:00:00Z",
                    "account_id": "ACC-1988-CHQ-001", "currency": "CAD",
                },
                {
                    "transaction_id": "TXN-1988-002", "type": "debit", "amount": -120.00,
                    "merchant_name": "Loblaws", "category": "groceries",
                    "status": "settled", "timestamp": "2026-09-27T14:30:00Z",
                    "account_id": "ACC-1988-CHQ-001", "currency": "CAD",
                },
                {
                    "transaction_id": "TXN-1988-003", "type": "credit", "amount": 2500.00,
                    "merchant_name": "ACN Payroll", "category": "income",
                    "status": "settled", "timestamp": "2026-09-26T09:00:00Z",
                    "account_id": "ACC-1988-CHQ-001", "currency": "CAD",
                },
            ]
        },
        'getBeneficiaries': {
            "status": "success",
            "data": [
                {
                    "beneficiary_id": "BEN-1988-001", "name": "Priya Bishnoi",
                    "nickname": "Priya", "account_number": "112987654",
                    "bank_name": "TD Bank", "created_at": "2024-03-10",
                },
            ]
        },
        'getBills': {
            "status": "success",
            "data": [
                {
                    "bill_id": "BILL-1988-001", "biller_name": "Rogers",
                    "category": "utilities", "due_amount": 142.50,
                    "due_date": "2026-10-15", "auto_pay": True,
                    "status": "upcoming", "account_id": "ACC-1988-CHQ-001",
                },
                {
                    "bill_id": "BILL-1988-002", "biller_name": "Enbridge",
                    "category": "utilities", "due_amount": 187.40,
                    "due_date": "2026-07-16", "auto_pay": False,
                    "status": "paid", "account_id": "ACC-1988-CHQ-001",
                },
            ]
        },
        'getFinancials': {
            "status": "success",
            "data": {
                "annual_income":      142000,
                "credit_score_band":  "Exceptional",
                "credit_score_value": 812,
                "pre_approved_offers": ["OFFER_TRAVEL_CC", "OFFER_SAVINGS_BOOST"],
                "spending_persona":   "established_homeowner",
            }
        },
        'getOverdraftDetails': {
            "status": "success",
            "data": {
                "overdraft_id":       "ODP-1988-001",
                "protection_enabled": True,
                "limit":              500,
                "linked_account_id":  "ACC-1988-CHQ-001",
                "fee_per_use":        5,
                "status":             "active",
                "enrolled_date":      "2019-04-01",
            }
        },
        'listPADs': {
            "status": "success",
            "data": [
                {
                    "pad_id": "PAD-1988-001", "payee_name": "Netflix Canada",
                    "amount": 20.99, "frequency": "monthly",
                    "next_debit_date": "2026-11-01",
                    "account_id": "ACC-1988-CHQ-001",
                    "status": "active", "type": "fixed",
                    "authorization_date": "2023-01-15",
                },
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

# --- Entry point ---
def before_tool_callback(tool: Tool, input: dict[str, Any], callback_context: CallbackContext) -> Optional[dict[str, Any]]:
    return before_tool_callback_impl(tool, input, callback_context)
