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

from datetime import datetime, timezone

import logging

from typing import Any, Optional

logger = logging.getLogger(__name__)

TOOL_MIN_AUTH = {
    # M5 auth flow tools — must run before full auth is established
    'identify_customer': 0,         # L0 → L1 identification
    'record_auth_event': 0,         # audit log, any level
    'issue_otp': 0,                 # customer_id (BT-1) is the real gate
    'verify_otp': 0,                # customer_id (BT-1) is the real gate
    'verify_pin': 0,                # customer_id (BT-1) is the real gate
    'request_app_push_approval': 1, # L3 step-up, needs L1
    'end_session': 0,
    'business_hours_check': 0,
    'format_for_tts': 0,
    'transfer_to_agent': 0,
    'fx_db_getExchangeRate': 0,  # toolset tools arrive as <toolset>_<operationId>; public FX rates
    'investments_db_getGICRates': 0,  # toolset tools arrive as <toolset>_<operationId>; public GIC rates
    'faq_knowledge_db_searchFAQs': 0,  # toolset tools arrive as <toolset>_<operationId>; public FAQ
    'faq_knowledge_db_getFAQ': 0,  # toolset tools arrive as <toolset>_<operationId>; public FAQ
    'faq_knowledge_db_listFAQCategories': 0,  # toolset tools arrive as <toolset>_<operationId>; public FAQ
    'account_opening_db_getAccountProducts': 0,  # toolset tools arrive as <toolset>_<operationId>; public product catalogue
    'manageCustomerDatabase_getConfig': 0,  # toolset tools arrive as <toolset>_<operationId>; public config (business hours)
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
    'quick_actions':                    0,  # UI chips
    'acn_faq_knowledge':                0,  # public FAQ
    'acn_customer_intelligence_engine': 1,  # needs identity only
    'ccaas_handoff':                    0,  # escalation path — never gate
    'ccaas_create_case':                0,  # escalation path — never gate
    'ccaas_schedule_callback':          0,  # escalation path — never gate
    'authorize_step_up':                0,  # grants L3
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
    # Money movement
    'createTransaction', 'updateTransaction',
    'createRecurringSchedule', 'updateRecurringSchedule', 'cancelRecurringSchedule',
    'createRedemption', 'createFXOrder', 'createFXDraft',
    'createStopPayment', 'createBankDraft', 'createChequeBookOrder',
    'createNSFReversal', 'cancelPAD',
    # Payee management
    'addPayee', 'updatePayee', 'deletePayee',
    # Account/card mutations
    'updateAccount', 'updateBill', 'updateCard', 'updateOverdraftProtection',
    # Personal changes
    'updateProfile', 'updateNotificationPreferences',
    'updatePaperlessEnrollment', 'updateMarketingConsent',
    # Applications
    'createApplication', 'updateApplication', 'persistApprovedCreditCardApplication',
    'createLoanApplication', 'updateLoanApplication',
    'createAccountApplication', 'updateAccountApplication', 'executeACNBankApplicationEmail',
    # KYC
    'createKycRequest', 'writeKycRecord',
    # Card activation
    'createActivationRequest', 'updateActivationRequest',
    # Disputes
    'createDispute', 'updateDispute', 'createPADDispute',
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
# ---------------------------------------------------------------------------
# FSW: direct-Firestore writes and queries for every toolset operation.
#
# The toolsets call Firestore's REST API, which only accepts typed documents
# ({"fields": {"amount": {"doubleValue": 100}}}), a documentId query parameter on create,
# an updateMask on update (without one a PATCH REPLACES the whole document) and a
# structuredQuery for runQuery. The model sends plain arguments, so every write failed
# with 400 "Unknown name ...". This builds the real request from the plain arguments, and:
#   * allows only the fields the spec declares (no mass assignment)
#   * forces customerId (body field and path parameter) to the session's customer
#   * validates required fields and path ids (no '/' or '..')
#   * makes a patch fail on a missing document instead of creating one
#   * derives a deterministic documentId for creates, so a retry is a 409, not a duplicate
#   * requires step-up (L3) for payee / profile / FX changes
# The registry below is GENERATED from the toolset specs (scripts/gen_firestore_writes.py).
# ---------------------------------------------------------------------------
_FSW_REGISTRY = json.loads('''{"account_opening_db_createAccountApplication":{"allow":["customerId","productId","applicationData"],"col":"account_applications","cust_field":true,"cust_path":false,"kind":"create","op":"createAccountApplication","path":[],"required":["productId"],"set":{},"stepup":false,"ts":"account_opening_db"},"account_opening_db_updateAccountApplication":{"allow":["status","decisionReason","applicationData"],"col":"account_applications","cust_field":false,"cust_path":false,"kind":"patch","op":"updateAccountApplication","path":["applicationId"],"required":[],"set":{},"stepup":false,"ts":"account_opening_db"},"appointments_db_cancelAppointment":{"allow":[],"col":"appointments","cust_field":false,"cust_path":false,"kind":"delete","op":"cancelAppointment","path":["appointmentId"],"required":[],"set":{},"stepup":false,"ts":"appointments_db"},"appointments_db_createAppointment":{"allow":["customerId","branchId","slotId","serviceType","notes","sendConfirmationEmail"],"col":"appointments","cust_field":true,"cust_path":false,"kind":"create","op":"createAppointment","path":[],"required":["branchId","slotId","serviceType"],"set":{},"stepup":false,"ts":"appointments_db"},"appointments_db_updateAppointment":{"allow":["slotId","notes","status"],"col":"appointments","cust_field":false,"cust_path":false,"kind":"patch","op":"updateAppointment","path":["appointmentId"],"required":[],"set":{},"stepup":false,"ts":"appointments_db"},"card_applications_createApplication":{"allow":["customerId","cardType","applicationData"],"col":"card_applications","cust_field":true,"cust_path":false,"kind":"create","op":"createApplication","path":[],"required":["cardType"],"set":{},"stepup":false,"ts":"card_applications"},"card_applications_persistApprovedCreditCardApplication":{"allow":["approvedCreditLimit","cardType","cardNumber","expiryDate"],"col":"persist_approved","cust_field":false,"cust_path":false,"kind":"create","op":"persistApprovedCreditCardApplication","path":["applicationId"],"required":[],"set":{},"stepup":false,"ts":"card_applications"},"card_applications_queryApplications":{"allow":["customerId","status"],"col":"card_applications","cust_field":true,"cust_path":false,"kind":"query","op":"queryApplications","path":[],"required":[],"set":{},"stepup":false,"ts":"card_applications"},"card_applications_updateApplication":{"allow":["status","applicationData","decisionReason","approvedCreditLimit"],"col":"card_applications","cust_field":false,"cust_path":false,"kind":"patch","op":"updateApplication","path":["applicationId"],"required":[],"set":{},"stepup":false,"ts":"card_applications"},"cheque_services_db_createBankDraft":{"allow":["customerId","fromAccountId","amount","currency","payee","memo","pickupBranchId","deliveryAddress"],"col":"bank_drafts","cust_field":true,"cust_path":false,"kind":"create","op":"createBankDraft","path":[],"required":["amount","currency","payee"],"set":{},"stepup":false,"ts":"cheque_services_db"},"cheque_services_db_createChequeBookOrder":{"allow":["customerId","accountId","quantity","deliveryAddress"],"col":"cheque_book_orders","cust_field":true,"cust_path":false,"kind":"create","op":"createChequeBookOrder","path":[],"required":["accountId","quantity"],"set":{},"stepup":false,"ts":"cheque_services_db"},"cheque_services_db_createStopPayment":{"allow":["customerId","accountId","chequeNumber","amount","payee","reason"],"col":"stop_payments","cust_field":true,"cust_path":false,"kind":"create","op":"createStopPayment","path":[],"required":["accountId","chequeNumber","amount","reason"],"set":{},"stepup":false,"ts":"cheque_services_db"},"customer_intelligence_db_logNudgeShown":{"allow":["nudgeId","outcome","channel"],"col":"nudge_log","cust_field":false,"cust_path":true,"kind":"create","op":"logNudgeShown","path":["customerId"],"required":["nudgeId","outcome","channel"],"set":{},"stepup":false,"ts":"customer_intelligence_db"},"digital_activation_db_createActivationRequest":{"allow":["customerId","activationType","cardId","channel","deviceInfo"],"col":"activation_requests","cust_field":true,"cust_path":false,"kind":"create","op":"createActivationRequest","path":[],"required":["activationType"],"set":{},"stepup":false,"ts":"digital_activation_db"},"digital_activation_db_updateActivationRequest":{"allow":["status","failureReason","completionData"],"col":"activation_requests","cust_field":false,"cust_path":false,"kind":"patch","op":"updateActivationRequest","path":["requestId"],"required":[],"set":{},"stepup":false,"ts":"digital_activation_db"},"disputes_db_createDispute":{"allow":["customerId","transactionId","type","amount","description"],"col":"disputes","cust_field":true,"cust_path":false,"kind":"create","op":"createDispute","path":[],"required":["transactionId","type","amount"],"set":{},"stepup":false,"ts":"disputes_db"},"disputes_db_createPADDispute":{"allow":["customerId","padId","amount","reason","cpaRule"],"col":"pad_disputes","cust_field":true,"cust_path":false,"kind":"create","op":"createPADDispute","path":[],"required":["padId","amount","reason"],"set":{},"stepup":false,"ts":"disputes_db"},"disputes_db_updateDispute":{"allow":["status","resolution","additionalInfo"],"col":"disputes","cust_field":false,"cust_path":false,"kind":"patch","op":"updateDispute","path":["disputeId"],"required":[],"set":{},"stepup":false,"ts":"disputes_db"},"faq_knowledge_db_searchFAQs":{"allow":["q","category","language","limit"],"col":"faqs","cust_field":false,"cust_path":false,"kind":"query","op":"searchFAQs","path":[],"required":["q"],"set":{},"stepup":false,"ts":"faq_knowledge_db"},"fx_db_createFXDraft":{"allow":["customerId","fromCurrency","toCurrency","amount","purpose"],"col":"fx_drafts","cust_field":true,"cust_path":false,"kind":"create","op":"createFXDraft","path":[],"required":["fromCurrency","toCurrency","amount"],"set":{},"stepup":true,"ts":"fx_db"},"fx_db_createFXOrder":{"allow":["customerId","fromAccountId","toAccountId","fromCurrency","toCurrency","amount","draftId"],"col":"fx_orders","cust_field":true,"cust_path":false,"kind":"create","op":"createFXOrder","path":[],"required":["fromCurrency","toCurrency","amount"],"set":{},"stepup":true,"ts":"fx_db"},"kyc_request_tracking_createKycRequest":{"allow":["customerId","channel","documentType","purpose"],"col":"kyc_requests","cust_field":true,"cust_path":false,"kind":"create","op":"createKycRequest","path":[],"required":["channel","documentType"],"set":{},"stepup":false,"ts":"kyc_request_tracking"},"kyc_request_tracking_writeKycRecord":{"allow":["entities","confidence","outcome","failureReason"],"col":"kyc_requests","cust_field":false,"cust_path":false,"kind":"patch","op":"writeKycRecord","path":["requestId"],"required":["outcome"],"set":{},"stepup":false,"ts":"kyc_request_tracking"},"loan_applications_createLoanApplication":{"allow":["customerId","type","amount","term","purpose","propertyValue","downPayment","employmentStatus","annualIncome"],"col":"loan_applications","cust_field":true,"cust_path":false,"kind":"create","op":"createLoanApplication","path":[],"required":["type","amount"],"set":{},"stepup":false,"ts":"loan_applications"},"loan_applications_queryLoanApplications":{"allow":["customerId","type","status"],"col":"loan_applications","cust_field":true,"cust_path":false,"kind":"query","op":"queryLoanApplications","path":[],"required":[],"set":{},"stepup":false,"ts":"loan_applications"},"loan_applications_updateLoanApplication":{"allow":["status","approvedAmount","approvedRate","decisionReason","applicationData"],"col":"loan_applications","cust_field":false,"cust_path":false,"kind":"patch","op":"updateLoanApplication","path":["applicationId"],"required":[],"set":{},"stepup":false,"ts":"loan_applications"},"manageCustomerDatabase_queryCustomers":{"allow":["identifierType","identifierValue"],"col":"customers","cust_field":false,"cust_path":false,"kind":"query","op":"queryCustomers","path":[],"required":[],"set":{},"stepup":false,"ts":"manageCustomerDatabase"},"new_transaction_api_db_cancelRecurringSchedule":{"allow":[],"col":"recurring_schedules","cust_field":false,"cust_path":false,"kind":"delete","op":"cancelRecurringSchedule","path":["scheduleId"],"required":[],"set":{},"stepup":false,"ts":"new_transaction_api_db"},"new_transaction_api_db_createRecurringSchedule":{"allow":["customerId","fromAccountId","toAccountId","toBeneficiaryId","toBillId","amount","currency","frequency","startDate","endDate","memo"],"col":"recurring_schedules","cust_field":true,"cust_path":false,"kind":"create","op":"createRecurringSchedule","path":[],"required":["fromAccountId","amount","frequency","startDate"],"set":{},"stepup":false,"ts":"new_transaction_api_db"},"new_transaction_api_db_listRecurringSchedules":{"allow":["customerId"],"col":"recurring_schedules","cust_field":true,"cust_path":false,"kind":"query","op":"listRecurringSchedules","path":[],"required":[],"set":{},"stepup":false,"ts":"new_transaction_api_db"},"new_transaction_api_db_updateRecurringSchedule":{"allow":["amount","frequency","nextRunDate","endDate","status"],"col":"recurring_schedules","cust_field":false,"cust_path":false,"kind":"patch","op":"updateRecurringSchedule","path":["scheduleId"],"required":[],"set":{},"stepup":false,"ts":"new_transaction_api_db"},"new_transaction_api_db_updateTransaction":{"allow":["status","failureReason"],"col":"transactions","cust_field":false,"cust_path":true,"kind":"patch","op":"updateTransaction","path":["customerId","transactionId"],"required":[],"set":{},"stepup":false,"ts":"new_transaction_api_db"},"overdraft_pad_db_cancelPAD":{"allow":["reason"],"col":"pads","cust_field":false,"cust_path":true,"kind":"patch","op":"cancelPAD","path":["customerId","padId"],"required":["reason"],"set":{"status":"cancelled"},"stepup":false,"ts":"overdraft_pad_db"},"overdraft_pad_db_createNSFReversal":{"allow":["nsfFeeId","reason"],"col":"nsf_reversals","cust_field":false,"cust_path":true,"kind":"create","op":"createNSFReversal","path":["customerId"],"required":["nsfFeeId","reason"],"set":{},"stepup":false,"ts":"overdraft_pad_db"},"overdraft_pad_db_createPADDispute":{"allow":["padId","amount","reason","cpaRule"],"col":"pad_disputes","cust_field":false,"cust_path":true,"kind":"create","op":"createPADDispute","path":["customerId"],"required":["padId","amount","reason"],"set":{},"stepup":false,"ts":"overdraft_pad_db"},"overdraft_pad_db_updateOverdraftProtection":{"allow":["enabled","linkedAccountId","overdraftLimit"],"col":"settings","cust_field":false,"cust_path":true,"kind":"patch","op":"updateOverdraftProtection","path":["customerId"],"required":["enabled"],"set":{},"stepup":false,"ts":"overdraft_pad_db"},"persist_approved_credit_card_patchCreditCardApplication":{"allow":["applicationStatus","notes"],"col":"card_applications","cust_field":false,"cust_path":false,"kind":"patch","op":"patchCreditCardApplication","path":["applicationId"],"required":[],"set":{},"stepup":false,"ts":"persist_approved_credit_card"},"persist_approved_credit_card_persistApprovedCreditCardApplication":{"allow":["customerId","approvedCreditLimit","interestRate","productType"],"col":"persist_approved","cust_field":true,"cust_path":false,"kind":"create","op":"persistApprovedCreditCardApplication","path":["applicationId"],"required":["approvedCreditLimit","interestRate","productType"],"set":{},"stepup":false,"ts":"persist_approved_credit_card"},"preferences_db_updateMarketingConsent":{"allow":["email","phone","mail","consentSource"],"col":"marketing_consent","cust_field":false,"cust_path":true,"kind":"patch","op":"updateMarketingConsent","path":["customerId"],"required":["email"],"set":{},"stepup":false,"ts":"preferences_db"},"preferences_db_updateNotificationPreferences":{"allow":["emailEnabled","smsEnabled","pushEnabled","lowBalanceAlert","transactionAlert","securityAlert","lowBalanceThreshold"],"col":"notifications","cust_field":false,"cust_path":true,"kind":"patch","op":"updateNotificationPreferences","path":["customerId"],"required":[],"set":{},"stepup":false,"ts":"preferences_db"},"preferences_db_updatePaperlessEnrollment":{"allow":["statementsEnabled","taxDocumentsEnabled","noticesEnabled"],"col":"paperless","cust_field":false,"cust_path":true,"kind":"patch","op":"updatePaperlessEnrollment","path":["customerId"],"required":[],"set":{},"stepup":false,"ts":"preferences_db"},"rewards_loyalty_db_createRedemption":{"allow":["points","redemptionType","destination"],"col":"redemptions","cust_field":false,"cust_path":true,"kind":"create","op":"createRedemption","path":["customerId"],"required":["points","redemptionType"],"set":{},"stepup":false,"ts":"rewards_loyalty_db"},"send_application_email_executeACNBankApplicationEmail":{"allow":["customerId","templateId","recipientEmail","templateData"],"col":"email_queue","cust_field":true,"cust_path":false,"kind":"create","op":"executeACNBankApplicationEmail","path":[],"required":["templateId","recipientEmail"],"set":{},"stepup":false,"ts":"send_application_email"},"update_customer_api_db_addPayee":{"allow":["name","email","accountNumber","bankName","institutionNumber","transitNumber","type"],"col":"beneficiaries","cust_field":false,"cust_path":true,"kind":"create","op":"addPayee","path":["customerId"],"required":["name","type"],"set":{},"stepup":true,"ts":"update_customer_api_db"},"update_customer_api_db_deletePayee":{"allow":[],"col":"beneficiaries","cust_field":false,"cust_path":true,"kind":"delete","op":"deletePayee","path":["customerId","beneficiaryId"],"required":[],"set":{},"stepup":true,"ts":"update_customer_api_db"},"update_customer_api_db_updateAccount":{"allow":["nickname","alertsEnabled","lowBalanceThreshold"],"col":"accounts","cust_field":false,"cust_path":true,"kind":"patch","op":"updateAccount","path":["customerId","accountId"],"required":[],"set":{},"stepup":false,"ts":"update_customer_api_db"},"update_customer_api_db_updateBill":{"allow":["nickname","accountNumber","defaultAmount"],"col":"bills","cust_field":false,"cust_path":true,"kind":"patch","op":"updateBill","path":["customerId","billId"],"required":[],"set":{},"stepup":false,"ts":"update_customer_api_db"},"update_customer_api_db_updateCard":{"allow":["status","travelNotice","controls"],"col":"cards","cust_field":false,"cust_path":true,"kind":"patch","op":"updateCard","path":["customerId","cardId"],"required":[],"set":{},"stepup":false,"ts":"update_customer_api_db"},"update_customer_api_db_updateOverdraftProtection":{"allow":["enabled","linkedAccountId","overdraftLimit"],"col":"settings","cust_field":false,"cust_path":true,"kind":"patch","op":"updateOverdraftProtection","path":["customerId","accountId"],"required":["enabled"],"set":{},"stepup":false,"ts":"update_customer_api_db"},"update_customer_api_db_updatePayee":{"allow":["name","email","accountNumber"],"col":"beneficiaries","cust_field":false,"cust_path":true,"kind":"patch","op":"updatePayee","path":["customerId","beneficiaryId"],"required":[],"set":{},"stepup":true,"ts":"update_customer_api_db"},"update_customer_api_db_updateProfile":{"allow":["email","phone","preferredName","address"],"col":"customers","cust_field":false,"cust_path":true,"kind":"patch","op":"updateProfile","path":["customerId"],"required":[],"set":{},"stepup":true,"ts":"update_customer_api_db"},"write_kyc_to_db_updateKycRecord":{"allow":["verificationStatus","reviewNotes","reviewedBy"],"col":"kyc_records","cust_field":false,"cust_path":false,"kind":"patch","op":"updateKycRecord","path":["kycId"],"required":[],"set":{},"stepup":false,"ts":"write_kyc_to_db"},"write_kyc_to_db_writeKycToDb":{"allow":["customerId","applicationId","documentType","verificationStatus","overallConfidence","manualReviewRequired","extractedDataHash"],"col":"kyc_records","cust_field":true,"cust_path":false,"kind":"create","op":"writeKycToDb","path":[],"required":["applicationId","documentType","verificationStatus","overallConfidence"],"set":{},"stepup":false,"ts":"write_kyc_to_db"}}''')
_FSW_BY_NAME = {}
_FSW_RESERVED = {'fields', 'documentId', 'updateMask.fieldPaths', 'currentDocument.exists', 'structuredQuery'}
_FSW_STEPUP_REASON = {'addPayee': 'new_payee', 'updatePayee': 'payee_edit', 'deletePayee': 'payee_edit',
                      'updateProfile': 'contact_change', 'createFXOrder': 'wire', 'createFXDraft': 'wire'}
_FSW_CUSTOMER_FIELD = {'phone': 'registered_mobile', 'email': 'email',
                       'account_number': 'account_number', 'caller_id': 'telephony_caller_id'}
_FSW_DOC_ROOT = 'projects/emvnzir-canada-song/databases/acn-bank-fs-db/documents'

def _fsw_build_index():
    counts = {}
    for _c in _FSW_REGISTRY.values():
        counts[_c['op']] = counts.get(_c['op'], 0) + 1
    for _k, _c in _FSW_REGISTRY.items():
        _FSW_BY_NAME[_k] = _c
        if counts[_c['op']] == 1:
            _FSW_BY_NAME[_c['op']] = _c
_fsw_build_index()

def _fsw_value(v):
    """Python value -> Firestore REST typed value."""
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {str(k): _fsw_value(x) for k, x in v.items()}}}
    if isinstance(v, (list, tuple)):
        return {"arrayValue": {"values": [_fsw_value(x) for x in v]}}
    return {"stringValue": str(v)}

def _fsw_safe_id(v) -> str:
    s = str(v if v is not None else '').strip()
    if not s or len(s) > 128 or '..' in s or s in ('.', '..'):
        return ''
    return s if all(ch.isalnum() or ch in '-_.' for ch in s) else ''

def _fsw_now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def _fsw_query(cfg, customer_id, plain):
    op = cfg['op']
    filters = []
    limit = 50
    if op == 'queryCustomers':
        field = _FSW_CUSTOMER_FIELD.get(str(plain.get('identifierType', '')).strip().lower())
        value = plain.get('identifierValue')
        if not field or value in (None, ''):
            return None, {"error": "MISSING_FIELD", "message": "identifierType (phone | email | account_number | caller_id) and identifierValue are required."}
        filters.append((field, str(value)))
        # only ever the session's own customer record, whatever identifier was supplied
        sq_ref = _FSW_DOC_ROOT + '/customers/' + customer_id
    else:
        sq_ref = None
        for k in cfg['allow']:
            if k in ('q', 'limit'):
                continue
            if plain.get(k) not in (None, ''):
                filters.append((k, plain[k]))
        if cfg.get('cust_field'):
            filters = [f for f in filters if f[0] != 'customerId'] + [('customerId', customer_id)]
        try:
            if plain.get('limit') not in (None, ''):
                limit = max(1, min(int(float(plain['limit'])), 50))
        except (ValueError, TypeError):
            pass
    parts = [{"fieldFilter": {"field": {"fieldPath": f}, "op": "EQUAL", "value": _fsw_value(v)}} for f, v in filters]
    if sq_ref:
        parts.append({"fieldFilter": {"field": {"fieldPath": "__name__"}, "op": "EQUAL", "value": {"referenceValue": sq_ref}}})
    sq = {"from": [{"collectionId": cfg['col']}], "limit": limit}
    if len(parts) == 1:
        sq["where"] = parts[0]
    elif parts:
        sq["where"] = {"compositeFilter": {"op": "AND", "filters": parts}}
    return sq, None

def _fsw_prepare(cfg, state, input_dict, auth_level) -> Optional[dict]:
    """Validate and rewrite a toolset write/query call in place. Returns an error dict to block it."""
    customer_id = str(state.get("customer_id", "") or "")
    public_query = cfg['kind'] == 'query' and not cfg.get('cust_field') and cfg['op'] != 'queryCustomers'
    if not customer_id and not public_query:
        return {"error": "AUTH_LEVEL_INSUFFICIENT", "message": "Please identify yourself first."}
    if cfg['stepup'] and auth_level < 3:
        reason = _FSW_STEPUP_REASON.get(cfg['op'], 'threshold')
        _set_auth(state, step_up_required=True, step_up_reason=reason)
        return {"error": "STEP_UP_REQUIRED",
                "message": "Additional verification required before this change: " + reason + ".",
                "step_up_reason": reason}
    nested = input_dict.get('fields') if isinstance(input_dict.get('fields'), dict) else {}
    _sq_in = input_dict.get('structuredQuery')
    if isinstance(_sq_in, dict) and 'from' not in _sq_in:
        nested = dict(_sq_in, **nested)   # the model put its plain filters inside structuredQuery
    path_vals = {}
    for pp in cfg['path']:
        if pp == 'customerId':
            path_vals[pp] = customer_id
            continue
        sid = _fsw_safe_id(input_dict.get(pp) if input_dict.get(pp) not in (None, '') else nested.get(pp))
        if not sid:
            return {"error": "MISSING_FIELD", "message": pp + " is required (letters, digits, - _ . only)."}
        path_vals[pp] = sid
    plain = dict(nested)
    for k, v in input_dict.items():
        if k not in _FSW_RESERVED and k not in cfg['path']:
            plain.setdefault(k, v)
    kind = cfg['kind']
    if kind == 'delete':
        input_dict.clear()
        input_dict.update(path_vals)
        return None
    if kind == 'query':
        sq, err = _fsw_query(cfg, customer_id, plain)
        if err:
            return err
        input_dict.clear()
        input_dict['structuredQuery'] = sq
        return None
    data = {k: plain[k] for k in cfg['allow'] if k in plain and plain[k] is not None and plain[k] != ''}
    if cfg.get('cust_field'):
        data['customerId'] = customer_id
    missing = [r for r in cfg['required'] if r not in data]
    if missing:
        return {"error": "MISSING_FIELD", "message": "Missing required field(s): " + ", ".join(missing) + "."}
    data.update(cfg.get('set') or {})
    changed = [k for k in data if k != 'customerId']
    if kind == 'patch' and not changed:
        return {"error": "NOTHING_TO_UPDATE", "message": "Provide at least one of: " + ", ".join(cfg['allow']) + "."}
    data['createdAt' if kind == 'create' else 'updatedAt'] = _fsw_now()
    input_dict.clear()
    input_dict.update(path_vals)
    if kind == 'create':
        bucket = str(int(datetime.now(timezone.utc).timestamp()) // 600)
        seed = "|".join([cfg['op'], customer_id, json.dumps({k: v for k, v in data.items() if k != 'createdAt'}, sort_keys=True, default=str), bucket])
        prefix = (cfg['op'][6:] if cfg['op'].startswith('create') else cfg['op']).upper()[:14]
        input_dict['documentId'] = prefix + "-" + hashlib.sha256(seed.encode()).hexdigest()[:16].upper()
    else:
        input_dict['updateMask.fieldPaths'] = list(data.keys())
        input_dict['currentDocument.exists'] = True
    input_dict['fields'] = {k: _fsw_value(v) for k, v in data.items()}
    return None

_HANDOFF_HOST = 'emvnzir-canada-song.web.app'


def _repair_handoff_url(raw, customer_id):
    """BT-1d: force https + trusted host + sso=web + the REAL customer_id onto
    the model-composed handoff_url; keep its loan_draft/handoff_token. Without
    the real id the app shows a login screen instead of the application."""
    origin = 'https://' + _HANDOFF_HOST
    base, _, query = str(raw or '').partition('?')
    # Boundary-checked: 'https://<host>.evil.com' must NOT count as the host.
    if not (base == origin or base.startswith(origin + '/')):
        tail = base.split('://', 1)[-1]
        path = tail.split('/', 1)[1] if '/' in tail else ''
        base = origin + '/' + path
    kept = [p for p in query.split('&')
            if p and p.partition('=')[0] not in ('sso', 'customer_id')]
    kept.append('sso=web')
    if customer_id:
        kept.append('customer_id=' + customer_id)
    return base + '?' + '&'.join(kept)


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

    # BT-10: Firestore query guard. Once a customer is authenticated, THEIR customer_id
    # is the only id customer-data tools may use. The leaf agents are never told the id,
    # so the model guesses one (a phone number, a made-up "CUST-10001", or ""), and
    # blocking that with a bare "Access denied" gave it no way to recover: the balance
    # was never returned. Correct the id instead of blocking. With no authenticated
    # customer, a model-supplied id is still refused.
    if customer_id:
        for _k in ('customerId', 'customer_id'):
            if _k in input_dict and input_dict.get(_k) != customer_id:
                logger.warning(f"BT-10 corrected {_k} in {tool_name}: model sent {input_dict.get(_k)!r}")
                input_dict[_k] = customer_id
        input_dict['customerId'] = customer_id
    elif input_dict.get('customerId'):
        logger.warning(f"BT-10 BLOCKED: customerId supplied with no authenticated customer in {tool_name}")
        return {"error": "OWNERSHIP_VIOLATION", "message": "Access denied."}
    if 'limit' in input_dict:
        input_dict['limit'] = min(int(input_dict.get('limit', 50) or 50), 50)

    # BT-1d: repair the handoff link rather than trust the model's version.
    if tool_name == 'mobile_handoff' and 'handoff_url' in input_dict:
        input_dict['handoff_url'] = _repair_handoff_url(
            input_dict.get('handoff_url', ''), customer_id)

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
    # BT-1c: reset on PROGRESS only. The identity hub is min-auth 0 and
    # BT-1-exempt, so it always reaches here; resetting on it disarmed BT-1b
    # (strikes 1->0->1->0) and the block/re-identify loop ran until the
    # per-minute model quota died as RESOURCE_EXHAUSTED.
    if customer_id:
        if _cnt(state).get("auth_block_count", "0") not in ("", "0"):
            _set_cnt(state, auth_block_count="0", auth_block_tool="")
        if _cnt(state).get("id_block_count", "0") not in ("", "0"):
            _set_cnt(state, id_block_count="0", id_block_tool="")

    # BT-FSW: toolset writes / queries -> validated, scoped, Firestore-shaped request
    _fsw_cfg = _FSW_BY_NAME.get(tool_name)
    if _fsw_cfg is not None:
        _fsw_err = _fsw_prepare(_fsw_cfg, state, input_dict, auth_level)
        if _fsw_err:
            return _fsw_err
        return None

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
        # Payee
        'addPayee': 'new_payee',
        'updatePayee': 'payee_edit',
        'deletePayee': 'payee_edit',
        # Personal
        'updateProfile': 'contact_change',
        'updateNotificationPreferences': 'contact_change',
        'updatePaperlessEnrollment': 'contact_change',
        'updateMarketingConsent': 'contact_change',
        # FX / wire
        'createFXOrder': 'wire',
        'createFXDraft': 'wire',
        # Transactions
        'createTransaction': 'transaction',
        'updateTransaction': 'transaction',
        'createRecurringSchedule': 'transaction',
        'updateRecurringSchedule': 'transaction',
        'cancelRecurringSchedule': 'transaction',
        'cancelPAD': 'transaction',
        'createNSFReversal': 'transaction',
        'createRedemption': 'transaction',
        'createStopPayment': 'transaction',
        'createBankDraft': 'transaction',
        'createChequeBookOrder': 'transaction',
        # Card/account mutations
        'updateCard': 'card_change',
        'updateAccount': 'account_change',
        'updateBill': 'account_change',
        'updateOverdraftProtection': 'account_change',
        'createActivationRequest': 'card_change',
        'updateActivationRequest': 'limit_increase',
        # Applications
        'createApplication': 'application',
        'updateApplication': 'application',
        'persistApprovedCreditCardApplication': 'threshold',
        'createLoanApplication': 'application',
        'updateLoanApplication': 'application',
        'createAccountApplication': 'application',
        'updateAccountApplication': 'application',
        'executeACNBankApplicationEmail': 'application',
        # KYC
        'createKycRequest': 'kyc',
        'writeKycRecord': 'kyc',
        # Disputes
        'createDispute': 'dispute',
        'updateDispute': 'dispute',
        'createPADDispute': 'dispute',
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
