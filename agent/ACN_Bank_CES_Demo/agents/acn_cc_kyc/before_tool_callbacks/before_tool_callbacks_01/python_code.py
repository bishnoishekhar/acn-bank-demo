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

import json

import hashlib

from datetime import datetime, timezone

import logging

from typing import Any, Optional

logger = logging.getLogger(__name__)

TOOL_MIN_AUTH = {
    'account_opening_db_createNewCustomer': 0,   # account opening: a person who is not a customer yet may use it (applicant id enforced by the engine)
    'account_opening_db_createAccountApplication': 0,   # account opening: a person who is not a customer yet may use it (applicant id enforced by the engine)
    'account_opening_db_updateAccountApplication': 0,   # account opening: a person who is not a customer yet may use it (applicant id enforced by the engine)
    'kyc_request_tracking_createKycRequest': 0,   # account opening: a person who is not a customer yet may use it (applicant id enforced by the engine)
    'kyc_request_tracking_writeKycRecord': 0,   # account opening: a person who is not a customer yet may use it (applicant id enforced by the engine)
    'send_application_email_executeACNBankApplicationEmail': 0,   # account opening: a person who is not a customer yet may use it (applicant id enforced by the engine)
    'account_opening_db_getAccountApplicationStatus': 0,   # account opening: a person who is not a customer yet may use it (applicant id enforced by the engine)
    'kyc_request_tracking_getKycStatus': 0,   # account opening: a person who is not a customer yet may use it (applicant id enforced by the engine)
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
    'transfer_to_agent':                   0,  # routing is not data access: a guest may be handed to a public specialist
    'fx_db_getExchangeRate': 0,  # toolset tools arrive as <toolset>_<operationId>; public FX rates
    'investments_db_getGICRates': 0,  # toolset tools arrive as <toolset>_<operationId>; public GIC rates
    'faq_knowledge_db_searchFAQs': 0,  # toolset tools arrive as <toolset>_<operationId>; public FAQ
    'faq_knowledge_db_getFAQ': 0,  # toolset tools arrive as <toolset>_<operationId>; public FAQ
    'faq_knowledge_db_listFAQCategories': 0,  # toolset tools arrive as <toolset>_<operationId>; public FAQ
    'account_opening_db_getAccountProducts': 0,  # toolset tools arrive as <toolset>_<operationId>; public product catalogue
    'manageCustomerDatabase_getConfig': 0,  # toolset tools arrive as <toolset>_<operationId>; public config (business hours)
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
    'acn-investment-card':                 0,  # widget render
    'acn-proactive-alert':                 0,  # widget render
    'acn-spending-dashboard':              0,  # widget render
    'acn-transactions-widget':             0,  # widget render
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
_FSW_REGISTRY = json.loads('''{"account_opening_db_createAccountApplication":{"allow":["customerId","productId","applicationData"],"applicant":true,"col":"account_applications","cust_field":true,"cust_path":false,"kind":"create","op":"createAccountApplication","path":[],"required":["productId"],"set":{},"stepup":false,"ts":"account_opening_db"},"account_opening_db_createNewCustomer":{"allow":["legal_name","preferred_name","date_of_birth","email","registered_mobile","street_address","city","province","postal_code","employment_status","occupation","annual_income","sin_provided","sin_last_four","preferred_language"],"applicant":"new","col":"customers","cust_field":false,"cust_path":false,"kind":"create","op":"createNewCustomer","path":[],"required":["legal_name","date_of_birth","email","registered_mobile"],"set":{"customer_tier":"mass_market","customer_type":"new_customer","global_status":"PENDING_ONBOARDING","identity_verified":false,"kyc_status":"pending","onboarding_channel":"account_opening_assistant"},"stepup":false,"ts":"account_opening_db"},"account_opening_db_updateAccountApplication":{"allow":["status","decisionReason","applicationData"],"applicant":true,"col":"account_applications","cust_field":false,"cust_path":false,"kind":"patch","op":"updateAccountApplication","path":["applicationId"],"required":[],"set":{},"stepup":false,"ts":"account_opening_db"},"appointments_db_cancelAppointment":{"allow":[],"col":"appointments","confirm_fields":["appointmentId"],"cust_field":false,"cust_path":false,"kind":"delete","op":"cancelAppointment","path":["appointmentId"],"required":[],"set":{},"stepup":false,"ts":"appointments_db"},"appointments_db_createAppointment":{"allow":["customerId","branchId","slotId","serviceType","notes","sendConfirmationEmail"],"col":"appointments","confirm_fields":["slotId"],"cust_field":true,"cust_path":false,"kind":"create","op":"createAppointment","path":[],"required":["branchId","slotId","serviceType"],"set":{},"stepup":false,"ts":"appointments_db"},"appointments_db_updateAppointment":{"allow":["slotId","notes","status"],"col":"appointments","confirm_fields":["slotId","status"],"cust_field":false,"cust_path":false,"kind":"patch","op":"updateAppointment","path":["appointmentId"],"required":[],"set":{},"stepup":false,"ts":"appointments_db"},"card_applications_createApplication":{"allow":["customerId","cardType","applicationData"],"col":"card_applications","cust_field":true,"cust_path":false,"kind":"create","op":"createApplication","path":[],"required":["cardType"],"set":{},"stepup":false,"ts":"card_applications"},"card_applications_persistApprovedCreditCardApplication":{"allow":["approvedCreditLimit","cardType","cardNumber","expiryDate"],"col":"persist_approved","cust_field":false,"cust_path":false,"kind":"create","op":"persistApprovedCreditCardApplication","path":["applicationId"],"required":[],"set":{},"stepup":false,"ts":"card_applications"},"card_applications_queryApplications":{"allow":["customerId","status"],"col":"card_applications","cust_field":true,"cust_path":false,"kind":"query","op":"queryApplications","path":[],"required":[],"set":{},"stepup":false,"ts":"card_applications"},"card_applications_updateApplication":{"allow":["status","applicationData","decisionReason","approvedCreditLimit"],"col":"card_applications","cust_field":false,"cust_path":false,"kind":"patch","op":"updateApplication","path":["applicationId"],"required":[],"set":{},"stepup":false,"ts":"card_applications"},"cheque_services_db_createBankDraft":{"allow":["customerId","fromAccountId","amount","currency","payee","memo","pickupBranchId","deliveryAddress"],"col":"bank_drafts","cust_field":true,"cust_path":false,"kind":"create","op":"createBankDraft","path":[],"required":["amount","currency","payee"],"set":{},"stepup":false,"ts":"cheque_services_db"},"cheque_services_db_createChequeBookOrder":{"allow":["customerId","accountId","quantity","deliveryAddress"],"col":"cheque_book_orders","cust_field":true,"cust_path":false,"kind":"create","op":"createChequeBookOrder","path":[],"required":["accountId","quantity"],"set":{},"stepup":false,"ts":"cheque_services_db"},"cheque_services_db_createStopPayment":{"allow":["customerId","accountId","chequeNumber","amount","payee","reason"],"col":"stop_payments","cust_field":true,"cust_path":false,"kind":"create","op":"createStopPayment","path":[],"required":["accountId","chequeNumber","amount","reason"],"set":{},"stepup":false,"ts":"cheque_services_db"},"customer_intelligence_db_logNudgeShown":{"allow":["nudgeId","outcome","channel"],"col":"nudge_log","cust_field":false,"cust_path":true,"kind":"create","op":"logNudgeShown","path":["customerId"],"required":["nudgeId","outcome","channel"],"set":{},"stepup":false,"ts":"customer_intelligence_db"},"digital_activation_db_createActivationRequest":{"allow":["customerId","activationType","cardId","channel","deviceInfo","requestedAmount","details"],"col":"activation_requests","confirm_fields":["activationType"],"cust_field":true,"cust_path":false,"kind":"create","op":"createActivationRequest","path":[],"required":["activationType"],"set":{},"stepup":false,"ts":"digital_activation_db"},"digital_activation_db_updateActivationRequest":{"allow":["status","failureReason","completionData"],"col":"activation_requests","cust_field":false,"cust_path":false,"kind":"patch","op":"updateActivationRequest","path":["requestId"],"required":[],"set":{},"stepup":false,"ts":"digital_activation_db"},"disputes_db_createDispute":{"allow":["customerId","transactionId","type","amount","description"],"col":"disputes","confirm_fields":["transactionId"],"cust_field":true,"cust_path":false,"kind":"create","op":"createDispute","path":[],"required":["transactionId","type","amount"],"set":{},"stepup":false,"ts":"disputes_db"},"disputes_db_createPADDispute":{"allow":["customerId","padId","amount","reason","cpaRule"],"col":"pad_disputes","cust_field":true,"cust_path":false,"kind":"create","op":"createPADDispute","path":[],"required":["padId","amount","reason"],"set":{},"stepup":false,"ts":"disputes_db"},"disputes_db_queryDisputes":{"allow":["customerId","status","type"],"col":"disputes","cust_field":true,"cust_path":false,"kind":"query","op":"queryDisputes","path":[],"required":[],"set":{},"stepup":false,"ts":"disputes_db"},"disputes_db_updateDispute":{"allow":["status","resolution","additionalInfo"],"col":"disputes","cust_field":false,"cust_path":false,"kind":"patch","op":"updateDispute","path":["disputeId"],"required":[],"set":{},"stepup":false,"ts":"disputes_db"},"faq_knowledge_db_searchFAQs":{"allow":["q","category","language","limit"],"col":"faqs","cust_field":false,"cust_path":false,"kind":"query","op":"searchFAQs","path":[],"required":["q"],"set":{},"stepup":false,"ts":"faq_knowledge_db"},"fx_db_createFXDraft":{"allow":["customerId","fromCurrency","toCurrency","amount","purpose"],"col":"fx_drafts","cust_field":true,"cust_path":false,"kind":"create","op":"createFXDraft","path":[],"required":["fromCurrency","toCurrency","amount"],"set":{},"stepup":true,"ts":"fx_db"},"fx_db_createFXOrder":{"allow":["customerId","fromAccountId","toAccountId","fromCurrency","toCurrency","amount","draftId"],"col":"fx_orders","cust_field":true,"cust_path":false,"kind":"create","op":"createFXOrder","path":[],"required":["fromCurrency","toCurrency","amount"],"set":{},"stepup":true,"ts":"fx_db"},"kyc_request_tracking_createKycRequest":{"allow":["customerId","channel","documentType","purpose"],"applicant":true,"col":"kyc_requests","cust_field":true,"cust_path":false,"kind":"create","op":"createKycRequest","path":[],"required":["channel","documentType"],"set":{},"stepup":false,"ts":"kyc_request_tracking"},"kyc_request_tracking_writeKycRecord":{"allow":["entities","confidence","outcome","failureReason"],"applicant":true,"col":"kyc_requests","cust_field":false,"cust_path":false,"kind":"patch","op":"writeKycRecord","path":["requestId"],"required":["outcome"],"set":{},"stepup":false,"ts":"kyc_request_tracking"},"loan_applications_createLoanApplication":{"allow":["customerId","type","amount","term","purpose","propertyValue","downPayment","employmentStatus","annualIncome"],"col":"loan_applications","confirm_fields":["amount"],"cust_field":true,"cust_path":false,"kind":"create","op":"createLoanApplication","path":[],"required":["type","amount"],"set":{},"stepup":false,"ts":"loan_applications"},"loan_applications_queryLoanApplications":{"allow":["customerId","type","status"],"col":"loan_applications","cust_field":true,"cust_path":false,"kind":"query","op":"queryLoanApplications","path":[],"required":[],"set":{},"stepup":false,"ts":"loan_applications"},"loan_applications_updateLoanApplication":{"allow":["status","approvedAmount","approvedRate","decisionReason","applicationData"],"col":"loan_applications","cust_field":false,"cust_path":false,"kind":"patch","op":"updateLoanApplication","path":["applicationId"],"required":[],"set":{},"stepup":false,"ts":"loan_applications"},"manageCustomerDatabase_queryCustomers":{"allow":["identifierType","identifierValue"],"col":"customers","cust_field":false,"cust_path":false,"kind":"query","op":"queryCustomers","path":[],"required":[],"set":{},"stepup":false,"ts":"manageCustomerDatabase"},"new_transaction_api_db_cancelRecurringSchedule":{"allow":[],"col":"recurring_schedules","cust_field":false,"cust_path":false,"kind":"delete","op":"cancelRecurringSchedule","path":["scheduleId"],"required":[],"set":{},"stepup":false,"ts":"new_transaction_api_db"},"new_transaction_api_db_createRecurringSchedule":{"allow":["customerId","fromAccountId","toAccountId","toBeneficiaryId","toBillId","amount","currency","frequency","startDate","endDate","memo"],"col":"recurring_schedules","cust_field":true,"cust_path":false,"kind":"create","op":"createRecurringSchedule","path":[],"required":["fromAccountId","amount","frequency","startDate"],"set":{},"stepup":false,"ts":"new_transaction_api_db"},"new_transaction_api_db_listRecurringSchedules":{"allow":["customerId"],"col":"recurring_schedules","cust_field":true,"cust_path":false,"kind":"query","op":"listRecurringSchedules","path":[],"required":[],"set":{},"stepup":false,"ts":"new_transaction_api_db"},"new_transaction_api_db_updateRecurringSchedule":{"allow":["amount","frequency","nextRunDate","endDate","status"],"col":"recurring_schedules","cust_field":false,"cust_path":false,"kind":"patch","op":"updateRecurringSchedule","path":["scheduleId"],"required":[],"set":{},"stepup":false,"ts":"new_transaction_api_db"},"new_transaction_api_db_updateTransaction":{"allow":["status","failureReason"],"col":"transactions","cust_field":false,"cust_path":true,"kind":"patch","op":"updateTransaction","path":["customerId","transactionId"],"required":[],"set":{},"stepup":false,"ts":"new_transaction_api_db"},"overdraft_pad_db_cancelPAD":{"allow":["reason"],"col":"pads","cust_field":false,"cust_path":true,"kind":"patch","op":"cancelPAD","path":["customerId","padId"],"required":["reason"],"set":{"status":"cancelled"},"stepup":false,"ts":"overdraft_pad_db"},"overdraft_pad_db_createNSFReversal":{"allow":["nsfFeeId","reason"],"col":"nsf_reversals","cust_field":false,"cust_path":true,"kind":"create","op":"createNSFReversal","path":["customerId"],"required":["nsfFeeId","reason"],"set":{},"stepup":false,"ts":"overdraft_pad_db"},"overdraft_pad_db_createPADDispute":{"allow":["padId","amount","reason","cpaRule"],"col":"pad_disputes","cust_field":false,"cust_path":true,"kind":"create","op":"createPADDispute","path":["customerId"],"required":["padId","amount","reason"],"set":{},"stepup":false,"ts":"overdraft_pad_db"},"overdraft_pad_db_updateOverdraftProtection":{"allow":["enabled","linkedAccountId","overdraftLimit"],"col":"settings","cust_field":false,"cust_path":true,"kind":"patch","op":"updateOverdraftProtection","path":["customerId"],"required":["enabled"],"set":{},"stepup":false,"ts":"overdraft_pad_db"},"persist_approved_credit_card_patchCreditCardApplication":{"allow":["applicationStatus","notes"],"col":"card_applications","cust_field":false,"cust_path":false,"kind":"patch","op":"patchCreditCardApplication","path":["applicationId"],"required":[],"set":{},"stepup":false,"ts":"persist_approved_credit_card"},"persist_approved_credit_card_persistApprovedCreditCardApplication":{"allow":["customerId","approvedCreditLimit","interestRate","productType"],"col":"persist_approved","cust_field":true,"cust_path":false,"kind":"create","op":"persistApprovedCreditCardApplication","path":["applicationId"],"required":["approvedCreditLimit","interestRate","productType"],"set":{},"stepup":false,"ts":"persist_approved_credit_card"},"preferences_db_updateMarketingConsent":{"allow":["email","phone","mail","consentSource"],"col":"marketing_consent","confirm_fields":["email","phone","mail"],"cust_field":false,"cust_path":true,"kind":"patch","op":"updateMarketingConsent","path":["customerId"],"required":["email"],"set":{},"stepup":false,"ts":"preferences_db","upsert":true},"preferences_db_updateNotificationPreferences":{"allow":["emailEnabled","smsEnabled","pushEnabled","lowBalanceAlert","transactionAlert","securityAlert","lowBalanceThreshold"],"col":"notifications","confirm_fields":["emailEnabled","smsEnabled","pushEnabled","lowBalanceAlert","transactionAlert","securityAlert","lowBalanceThreshold"],"cust_field":false,"cust_path":true,"kind":"patch","op":"updateNotificationPreferences","path":["customerId"],"required":[],"set":{},"stepup":false,"ts":"preferences_db","upsert":true},"preferences_db_updatePaperlessEnrollment":{"allow":["statementsEnabled","taxDocumentsEnabled","noticesEnabled"],"col":"paperless","confirm_fields":["statementsEnabled","taxDocumentsEnabled","noticesEnabled"],"cust_field":false,"cust_path":true,"kind":"patch","op":"updatePaperlessEnrollment","path":["customerId"],"required":[],"set":{},"stepup":false,"ts":"preferences_db","upsert":true},"rewards_loyalty_db_createRedemption":{"allow":["points","redemptionType","destination"],"col":"redemptions","cust_field":false,"cust_path":true,"kind":"create","op":"createRedemption","path":["customerId"],"required":["points","redemptionType"],"set":{},"stepup":false,"ts":"rewards_loyalty_db"},"send_application_email_executeACNBankApplicationEmail":{"allow":["customerId","templateId","recipientEmail","templateData"],"applicant":true,"col":"email_queue","cust_field":true,"cust_path":false,"kind":"create","op":"executeACNBankApplicationEmail","path":[],"required":["templateId","recipientEmail"],"set":{},"stepup":false,"ts":"send_application_email"},"update_customer_api_db_addPayee":{"allow":["name","email","accountNumber","bankName","institutionNumber","transitNumber","type"],"col":"beneficiaries","cust_field":false,"cust_path":true,"kind":"create","op":"addPayee","path":["customerId"],"required":["name","type"],"set":{},"stepup":true,"ts":"update_customer_api_db"},"update_customer_api_db_deletePayee":{"allow":[],"col":"beneficiaries","cust_field":false,"cust_path":true,"kind":"delete","op":"deletePayee","path":["customerId","beneficiaryId"],"required":[],"set":{},"stepup":true,"ts":"update_customer_api_db"},"update_customer_api_db_updateAccount":{"allow":["nickname","alertsEnabled","lowBalanceThreshold"],"col":"accounts","cust_field":false,"cust_path":true,"kind":"patch","op":"updateAccount","path":["customerId","accountId"],"required":[],"set":{},"stepup":false,"ts":"update_customer_api_db"},"update_customer_api_db_updateBill":{"allow":["nickname","accountNumber","defaultAmount"],"col":"bills","cust_field":false,"cust_path":true,"kind":"patch","op":"updateBill","path":["customerId","billId"],"required":[],"set":{},"stepup":false,"ts":"update_customer_api_db"},"update_customer_api_db_updateCard":{"allow":["status","travelNotice","controls"],"col":"cards","confirm_fields":["travelNotice"],"cust_field":false,"cust_path":true,"kind":"patch","op":"updateCard","path":["customerId","cardId"],"required":[],"set":{},"stepup":false,"ts":"update_customer_api_db"},"update_customer_api_db_updateOverdraftProtection":{"allow":["enabled","linkedAccountId","overdraftLimit"],"col":"settings","cust_field":false,"cust_path":true,"kind":"patch","op":"updateOverdraftProtection","path":["customerId","accountId"],"required":["enabled"],"set":{},"stepup":false,"ts":"update_customer_api_db"},"update_customer_api_db_updatePayee":{"allow":["name","email","accountNumber"],"col":"beneficiaries","cust_field":false,"cust_path":true,"kind":"patch","op":"updatePayee","path":["customerId","beneficiaryId"],"required":[],"set":{},"stepup":true,"ts":"update_customer_api_db"},"update_customer_api_db_updateProfile":{"allow":["email","phone","preferredName","address"],"col":"customers","confirm_fields":["email","phone","address","preferredName"],"cust_field":false,"cust_path":true,"kind":"patch","op":"updateProfile","path":["customerId"],"required":[],"set":{},"stepup":true,"ts":"update_customer_api_db"},"write_kyc_to_db_updateKycRecord":{"allow":["verificationStatus","reviewNotes","reviewedBy"],"col":"kyc_records","cust_field":false,"cust_path":false,"kind":"patch","op":"updateKycRecord","path":["kycId"],"required":[],"set":{},"stepup":false,"ts":"write_kyc_to_db"},"write_kyc_to_db_writeKycToDb":{"allow":["customerId","applicationId","documentType","verificationStatus","overallConfidence","manualReviewRequired","extractedDataHash"],"col":"kyc_records","cust_field":true,"cust_path":false,"kind":"create","op":"writeKycToDb","path":[],"required":["applicationId","documentType","verificationStatus","overallConfidence"],"set":{},"stepup":false,"ts":"write_kyc_to_db"}}''')

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

def _fsw_clean_new_customer(data):
    """A new applicant's details: normalise the phone, keep only the last four SIN digits, refuse nonsense. Returns an error dict or None."""
    import re as _re
    digits = ''.join(ch for ch in str(data.get('registered_mobile', '')) if ch.isdigit())
    if len(digits) == 11 and digits.startswith('1'):
        digits = digits[1:]
    if len(digits) != 10:
        return {"error": "INVALID_FIELD", "message": "registered_mobile must be a 10-digit Canadian phone number."}
    data['registered_mobile'] = '+1' + digits
    dob = str(data.get('date_of_birth', '')).strip()
    if not _re.match(r'^\d{4}-\d{2}-\d{2}$', dob):
        return {"error": "INVALID_FIELD", "message": "date_of_birth must be written YYYY-MM-DD."}
    try:
        born = datetime.strptime(dob, '%Y-%m-%d')
        today = datetime.now(timezone.utc)
        age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    except ValueError:
        return {"error": "INVALID_FIELD", "message": "date_of_birth is not a real date."}
    if age < 16 or age > 120:
        return {"error": "NOT_ELIGIBLE", "message": "Applicants must be at least 16 years old (18 for most accounts)."}
    if not _re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', str(data.get('email', '')).strip()):
        return {"error": "INVALID_FIELD", "message": "email does not look like an email address."}
    if 'sin_last_four' in data:
        last4 = ''.join(ch for ch in str(data['sin_last_four']) if ch.isdigit())[-4:]
        if last4:
            data['sin_last_four'] = last4
            data['sin_provided'] = True
        else:
            data.pop('sin_last_four')
    data.setdefault('sin_provided', False)
    return None

def _confirm_block(cfg, state, input_dict, callback_context) -> Optional[dict]:
    """A field the customer must confirm in their own words (a travel notice) is held back: the first call is turned back with a
    read-back request, and the write goes through only when the same details come again after a LATER customer message that says yes."""
    fields = cfg.get('confirm_fields') or []
    if not fields:
        return None
    import re as _re
    import time
    nested = input_dict.get('fields') if isinstance(input_dict.get('fields'), dict) else {}
    plain = dict(nested)
    for k, v in input_dict.items():
        if k not in _FSW_RESERVED:
            plain.setdefault(k, v)
    if not any(plain.get(f) not in (None, '') for f in fields):
        return None
    sig = hashlib.sha256(json.dumps(plain, sort_keys=True, default=str).lower().encode()).hexdigest()[:16]
    try:
        uc = getattr(callback_context, 'user_content', None)
        said = " ".join((getattr(p, 'text', '') or '') for p in (getattr(uc, 'parts', None) or [])).strip()
    except Exception:
        said = ''
    said_h = hashlib.sha256(said.lower().encode()).hexdigest()[:10] if said else ''
    now = time.time()
    try:
        pend = json.loads(state.get('confirm_pending', '') or '{}')
    except Exception:
        pend = {}
    if pend.get('sig') == sig and now - float(pend.get('ts', 0) or 0) < 900:
        if said:
            said_yes = bool(_re.search(r"\b(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|go ahead|please do|do it|proceed|correct|that'?s right|that is right|sounds good|set it|submit it)\b", said, _re.I))
            said_no = bool(_re.search(r"\b(no|nope|don'?t|do not|cancel|stop|wait|not yet|hold on|change|wrong|incorrect)\b", said, _re.I))
            allowed = said_yes and not said_no and said_h != pend.get('said')
        else:
            allowed = now - float(pend.get('ts', 0) or 0) >= 5          # a voice turn with no transcript: only a later turn counts
        if allowed:
            state['confirm_pending'] = ''
            return None
    else:
        state['confirm_pending'] = json.dumps({'sig': sig, 'said': said_h, 'ts': now})
    return {"error": "CONFIRMATION_REQUIRED",
            "message": "Not saved yet. Read the details back to the customer in one sentence (a loan: amount, term and purpose; a travel notice: card, country and dates; a dispute: the charge and amount; an appointment: branch, day and time; a profile change: what changes to what; a preference: which setting changes), "
                       "ask \"Shall I go ahead?\" and WAIT for their reply. Asking for a quote or an estimate is NOT a yes. Only when they clearly say yes, "
                       "call this tool again with exactly the same details. Do not mention this notice."}

def _fsw_prepare(cfg, state, input_dict, auth_level) -> Optional[dict]:
    """Validate and rewrite a toolset write/query call in place. Returns an error dict to block it."""
    customer_id = str(state.get("customer_id", "") or "")
    applicant = cfg.get('applicant')
    if not customer_id and applicant:
        customer_id = str(state.get("applicant_id", "") or "")     # a new applicant: the id saved by createNewCustomer
    public_query = cfg['kind'] == 'query' and not cfg.get('cust_field') and cfg['op'] != 'queryCustomers'
    if not customer_id and not public_query and applicant != 'new':
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
    if cfg['op'] == 'createNewCustomer':
        _bad = _fsw_clean_new_customer(data)
        if _bad:
            return _bad
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
        if not cfg.get('upsert'):                       # a preference document is created on the first write
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

# --- VOICE speak-first gate (armed by after_model) ---
_GATED_WIDGETS = frozenset(['acn-amount-input', 'acn-credit-card-widget', 'acn-form-input', 'acn-insight-card', 'acn-nudge-card', 'acn-payee-selector', 'acn-payment-carousel', 'acn-payment-receipt', 'card_carousel', 'card_widget', 'epp_carousel', 'epp_plans', 'loan_preapproval', 'mobile_handoff', 'mortgage_affordability', 'mortgage_calculator', 'mortgage_kyc', 'mortgage_nudge', 'mortgage_rate_shelf', 'mortgage_rate_table', 'qr_widget', 'quick_actions'])

def _gate_fresh_summary(state):
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

def _speak_first_block(state, tool_name):
    """Return a blocking dict if this widget call must be preceded by speech (voice sessions only)."""
    try:
        gate = str(state.get('speak_gate', '') or '')
        short = str(tool_name).split('/')[-1]
        if not gate or short not in _GATED_WIDGETS:
            return None
        if int(state.get('speak_gate_n', 0) or 0) >= 2:      # never loop: after two nudges let it through
            state['speak_gate'] = ''
            return None
        state['speak_gate'] = ''
        state['speak_gate_n'] = int(state.get('speak_gate_n', 0) or 0) + 1
        kind = gate.split(':', 1)[0]
        if kind == 'silent':
            data = _gate_fresh_summary(state) if short in ('quick_actions', 'acn-payment-carousel', 'acn-payee-selector', 'acn-insight-card') else ''
            if data:
                state['spoken_summary'] = ''
                say = ("Say this to the customer, word for word: \"" + data + "\" Then call the widget again.")
            elif short in ('card_carousel', 'card_widget', 'mortgage_rate_table', 'mortgage_rate_shelf'):
                say = ("Start with: \"I can provide information but not personalized financial advice. Please consider consulting a "
                       "financial advisor for your specific situation.\" then one short sentence about what is on the screen and one "
                       "short question that moves the customer forward. Then call the widget again.")
            else:
                say = "Say one or two short sentences answering the customer and ending with a question, then call the widget again."
                opts = str(state.get('speak_gate_opts', '') or '')
                if opts and short == 'quick_actions':
                    say = ("Say one or two short sentences answering the customer and naming these choices naturally: " + opts +
                           ". End with a question, then call quick_actions again.")
            return {"error": "SPEAK_FIRST",
                    "message": ("STOP. You called a widget without telling the customer what it shows. In a voice conversation nothing can be said after "
                                "a widget, so the customer would hear silence. Speak your reply NOW, in this response, before the "
                                "widget call. " + say + " Do not mention this notice.")}
        return {"error": "SPEAK_FIRST",
                "message": ("You told the customer what you are showing but asked nothing, and nothing can be said after a widget, "
                            "so the conversation would stall. Do NOT repeat what you already said. Add ONE short question that moves "
                            "them forward (cards: whether they want more details on one of them or an eligibility check; rates: "
                            "whether they are buying, renewing or want to see what they could afford; plans: which plan), then call "
                            "the widget again. Do not mention this notice.")}
    except Exception:
        return None

# --- Session close: recap + rating question + farewell, said by the model (works in voice AND text) ---
_CLOSE_PHRASES = (
    ('getAccounts', 'checked your account balances'), ('listCustomerTransactions', 'reviewed your recent transactions'),
    ('getCards', 'looked over your cards'), ('getBeneficiaries', 'went through your saved payees'),
    ('getBills', 'checked your bills'), ('createTransaction', 'sent your payment'),
    ('addPayee', 'added a new payee'), ('updatePayee', 'updated a payee'), ('deletePayee', 'removed a payee'),
    ('updateCard', 'updated your card settings'), ('updateAccount', 'updated your account'),
    ('updateProfile', 'updated your profile'), ('updateBill', 'updated a bill'),
    ('createDispute', 'opened a dispute for you'), ('createAppointment', 'booked your branch appointment'),
    ('updateAppointment', 'changed your appointment'), ('cancelAppointment', 'cancelled your appointment'),
    ('getAvailableSlots', 'checked appointment times'), ('createChequeBookOrder', 'ordered your cheques'),
    ('createStopPayment', 'placed a stop payment'), ('createFXOrder', 'set up your currency exchange'),
    ('getExchangeRate', 'checked the exchange rate'), ('getGICRates', 'looked at our GIC rates'),
    ('createRedemption', 'processed your rewards redemption'), ('getRewardsBalance', 'checked your rewards balance'),
    ('createNSFReversal', 'requested your NSF fee reversal'), ('getOverdraftDetails', 'reviewed your overdraft details'),
    ('cancelPAD', 'cancelled a pre-authorized debit'), ('createPADDispute', 'raised a pre-authorized debit dispute'),
    ('listPADs', 'reviewed your pre-authorized debits'), ('createRecurringSchedule', 'set up a recurring payment'),
    ('createApplication', 'started your application'), ('createLoanApplication', 'started your loan application'),
    ('createAccountApplication', 'started your account application'),
    ('persistApprovedCreditCardApplication', 'saved your credit card application'),
    ('updateNotificationPreferences', 'updated your notification preferences'),
    ('updatePaperlessEnrollment', 'updated your paperless settings'), ('updateMarketingConsent', 'updated your consent choices'),
    ('calculate_mortgage_payment', 'estimated a mortgage payment'), ('mortgage_payment_estimate', 'estimated a mortgage payment'),
    ('calculate_affordability', 'estimated what you could afford'), ('mortgage_affordability_estimate', 'estimated what you could afford'),
    ('calculate_loan_payment', 'estimated a loan payment'), ('calculate_epp_plans', 'compared payment plans'),
    ('epp_plan_calculator', 'compared payment plans'), ('build_trip_plan', 'built your trip plan'),
    ('build_spend_plan', 'planned your trip spending'), ('searchFAQs', 'answered your questions'),
    ('getInvestmentAccounts', 'reviewed your investment accounts'), ('getContributionRoom', 'checked your contribution room'),
    ('createActivationRequest', 'started your card activation'),
)

def _close_recap(state):
    """One honest sentence about what actually happened today, built from the tools that succeeded."""
    try:
        done = json.loads(state.get('completed_actions', '[]') or '[]')
    except Exception:
        done = []
    phrases = []
    for item in done:
        tool = str(item.get('tool', '') if isinstance(item, dict) else item).split('/')[-1]
        for key, phrase in _CLOSE_PHRASES:
            if tool.endswith(key) and phrase not in phrases:
                phrases.append(phrase)
    phrases = phrases[:4]
    if not phrases:
        return ''
    body = phrases[0] if len(phrases) == 1 else ", ".join(phrases[:-1]) + " and " + phrases[-1]
    return "Today I " + body + "."

def _close_rating_from(callback_context, input_dict):
    try:
        params = (input_dict or {}).get('params') or {}
        if isinstance(params, dict) and str(params.get('csat_rating', '')).strip()[:1] in ('1', '2', '3', '4', '5'):
            return int(str(params.get('csat_rating')).strip()[:1])
    except Exception:
        pass
    import re
    try:
        uc = getattr(callback_context, 'user_content', None)
        said = " ".join((getattr(p, 'text', '') or '') for p in (getattr(uc, 'parts', None) or []))
        m = re.search(r'\b([1-5])\b', said)
        if m:
            return int(m.group(1))
        words = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5}
        m = re.search(r'\b(one|two|three|four|five)\b', said, re.IGNORECASE)
        if m:
            return words[m.group(1).lower()]
    except Exception:
        pass
    return 0

def _close_block(state, tool_name, input_dict, callback_context):
    """end_session with no recap/rating/farewell: send the model back to say them (once each, never a loop)."""
    try:
        if str(tool_name).split('/')[-1] != 'end_session':
            return None
        args = input_dict or {}
        if str(args.get('session_escalated', '')).strip().lower() in ('true', '1', 'yes'):
            return None
        csat = json.loads(state.get('csat', '{}') or '{}')
        n = int(csat.get('gate_n', 0) or 0)
        if n >= 3:
            return None
        params = args.get('params') or {}
        rated = isinstance(params, dict) and params.get('csat_rating') not in (None, '')
        if not rated and not csat.get('offered'):
            csat['offered'] = True
            csat['gate_n'] = n + 1
            state['csat'] = json.dumps(csat)
            say = (_close_recap(state) + " " if _close_recap(state) else "") + "Before you go, how would you rate your experience today, from 1 to 5?"
            return {"error": "CLOSE_RATING",
                    "message": ("Do not end the session yet. In THIS response, say to the customer, word for word: \"" + say + "\" "
                                "Then, if you have the quick_actions tool, call it once with type quick_actions, summary Rate your experience, "
                                "and these five actions as content / utterance: 1 - Poor / 1, 2 - Fair / 2, 3 - Okay / 3, 4 - Good / 4, "
                                "5 - Excellent / 5. Do NOT say goodbye, take care or have a nice day in this response: the farewell comes "
                                "after they answer. End your reply with the question: do not add Here are your options or any other line after it. Do not mention this notice.")}
        if str(state.get('close_spoken', '')) != '1':
            rating = _close_rating_from(callback_context, args)
            if rating >= 4:
                lead = "Thank you for the " + str(rating) + ", I'm glad I could help."
            elif rating == 3:
                lead = "Thanks for the feedback, we'll keep working to make it better."
            elif rating in (1, 2):
                lead = "I'm sorry we fell short today, and thank you for telling me."
            else:
                lead = "Thank you for your feedback."
            name = str(state.get('customer_display_name', '') or state.get('pref_name', '') or '').strip()
            farewell = (lead + " I'm here whenever you need me, or you can call us any time at 1-800-ACN-BANK. Take care" +
                        (", " + name if name else "") + "!")
            csat['gate_n'] = n + 1
            state['csat'] = json.dumps(csat)
            state['close_spoken'] = '1'
            return {"error": "CLOSE_FAREWELL",
                    "message": ("You are ending the session without saying anything. Say this to the customer, word for word: \"" + farewell +
                                "\" and then call end_session again in the same response. Do not mention this notice.")}
        return None
    except Exception:
        return None

# --- Fresh PIN for every account activity ---------------------------------------------------------------------
# Signing in (the website, or a PIN from earlier) never carries over from one request to the next. Every request that touches
# the customer's accounts needs a PIN verified FOR THAT REQUEST: the identity hub reports it (pin_verified_at), after_tool keeps
# it as pin_grant_ts, the request's account tools use it, and after_model spends it when the reply is final. The same PIN also
# satisfies the write-action step-up (one request, one PIN).
_PIN_GRANT_SECONDS = 300
_PIN_FLOW_IDLE_SECONDS = 180      # a journey in progress: how long the customer may pause between steps
_PIN_FLOW_MAX_SECONDS = 900       # and the longest one PIN ever covers
_REAUTH_FREE_PREFIXES = ('customer_intelligence_db_',)
_REAUTH_FREE = frozenset(['acn_customer_intelligence_engine', 'call_cie', 'acn_identity_security_hub', 'call_identity_hub',
                          'acn_faq_knowledge', 'call_faq', 'transfer_to_agent', 'end_session', 'identify_customer', 'authenticate',
                          'authorize_step_up', 'verify_pin', 'issue_otp', 'verify_otp', 'record_auth_event'])
# people who are not customers yet (no customer_id): applying for an account needs no PIN, they have none
_REAUTH_NEW_APPLICANT_OK = frozenset(['account_opening_db_createNewCustomer', 'account_opening_db_createAccountApplication', 'account_opening_db_getAccountApplicationStatus',
                                      'account_opening_db_updateAccountApplication', 'kyc_request_tracking_createKycRequest',
                                      'kyc_request_tracking_getKycStatus', 'kyc_request_tracking_writeKycRecord',
                                      'send_application_email_executeACNBankApplicationEmail'])

def _pin_grant_fresh(state):
    try:
        ts = float(state.get('pin_grant_ts', 0) or 0)
        if ts <= 0 or ts <= float(state.get('pin_consumed_ts', 0) or 0):
            return False
        import time
        now = time.time()
        if (now - ts) < _PIN_GRANT_SECONDS:
            return True
        # a journey in progress (payee picked, amount entered, waiting for the customer's yes): the PIN stays good while they keep going
        if state.get('pin_flow_open') and not state.get('pin_flow_done'):
            return (now - float(state.get('pin_flow_ts', 0) or 0)) < _PIN_FLOW_IDLE_SECONDS and (now - ts) < _PIN_FLOW_MAX_SECONDS
        return False
    except Exception:
        return False

_REAUTH_WALKED_AWAY = ("cancel", "never mind", "nevermind", "forget it", "no thanks", "no thank you", "not now", "instead", "changed my mind", "that's all", "thats all")

def _plain_words(said):
    """The customer's words without punctuation or capitals: 'No.' / 'NO!' -> 'no'."""
    return ''.join(ch for ch in str(said or '').lower() if ch.isalpha() or ch in " '").strip()

def _customer_walked_away(callback_context):
    """The customer's message drops the journey in progress (cancel, never mind, 'show my balance instead')."""
    try:
        uc = getattr(callback_context, 'user_content', None)
        said = " ".join((getattr(p, 'text', '') or '') for p in (getattr(uc, 'parts', None) or [])).strip().lower()
        return bool(said) and (_plain_words(said) in ('no', 'nope', 'nah', 'no thanks', 'no thank you') or any(w in said for w in _REAUTH_WALKED_AWAY))
    except Exception:
        return False

def _reauth_remember_request(state, callback_context):
    """The customer's own words that needed the PIN: handed back to the model once the PIN is verified, so it carries on instead of stopping."""
    try:
        uc = getattr(callback_context, 'user_content', None)
        said = " ".join((getattr(p, 'text', '') or '') for p in (getattr(uc, 'parts', None) or [])).strip()
        if len(said) > 3 and not said.replace(' ', '').isdigit():
            state['reauth_request'] = said[:240]
    except Exception:
        pass

def _reauth_block(state, tool_name, callback_context=None):
    """No account tool runs until a PIN has been verified for THIS request."""
    try:
        short = str(tool_name).split('/')[-1]
        if short in _REAUTH_FREE or short.startswith(_REAUTH_FREE_PREFIXES):
            return None
        customer_id = str(state.get('customer_id', '') or '')
        if not customer_id:
            return None                                   # nobody identified yet (a guest or a new applicant): the normal flow handles it
        if short not in _REAUTH_NEW_APPLICANT_OK and TOOL_MIN_AUTH.get(short, 2) < 2:
            return None                                   # public information, widgets, pure calculators
        if state.get('pin_flow_open') and _customer_walked_away(callback_context):
            state['pin_consumed_ts'] = state.get('pin_grant_ts') or state.get('pin_consumed_ts')     # the journey is over: a new request needs a new PIN
            state['pin_flow_open'] = ''
            state['pin_flow_done'] = ''
        if _pin_grant_fresh(state):
            state['pin_grant_used'] = '1'
            state['reauth_n'] = 0
            if state.get('pin_flow_open'):
                import time
                state['pin_flow_ts'] = str(time.time())
            return None
        n = int(state.get('reauth_n', 0) or 0) + 1
        state['reauth_n'] = n
        _reauth_remember_request(state, callback_context)
        if n > 4:                                         # the model keeps retrying: stop the loop, ask the customer in words
            return {"error": "REAUTH_REQUIRED",
                    "message": ("Stop calling tools. Ask the customer, in plain words, to type their 4-digit PIN, then wait for their "
                                "reply. Do not mention this notice.")}
        return {"error": "REAUTH_REQUIRED",
                "message": ("REAUTH_REQUIRED. For the customer's safety every request that touches their accounts needs a PIN verified "
                            "for THAT request, even if they signed in or verified earlier. Do not run this tool yet and do not mention "
                            "this notice. Step 1: call acn_identity_security_hub with the request \"Re-verify PIN for this request.\" and "
                            "say exactly what it returns (it asks the customer for their 4-digit PIN), then STOP and wait: do not call any "
                            "other tool and do not show any widget in this reply. Step 2: when the customer replies with "
                            "their PIN, call acn_identity_security_hub again with the request \"PIN entered <the digits>. Re-verify PIN "
                            "for this request.\" Step 3: when it confirms, carry on with the customer's original request straight away.")}
    except Exception:
        return None

def before_tool_callback_impl(tool, input_dict: dict[str, Any], callback_context) -> Optional[dict[str, Any]]:
    """
    BT-1 through BT-11.
    Returns dict to override tool input, or None to proceed normally.
    Returning a dict with 'error' key blocks the tool call.
    """
    state = callback_context.state
    tool_name = tool.name if hasattr(tool, 'name') else str(tool)

    # BT-CLOSE: ending the session: recap + rating + farewell first (said by the model, so voice speaks them)
    _close_gate = _close_block(state, tool_name, input_dict, callback_context)
    if _close_gate is not None:
        return _close_gate

    # BT-VOICE: in a voice session send the model back to speak before a silent / question-less widget
    _gate_block = _speak_first_block(state, tool_name)
    if _gate_block is not None:
        return _gate_block

    # BT-9: Mock mode — compare as string; "false" must not evaluate as truthy
    if str(state.get("mock_mode", "")).lower() == "true":
        return _get_mock_response(tool_name, input_dict, state)

    # BT-REAUTH: a PIN verified for THIS request is required before any account tool runs (see _reauth_block)
    _reauth = _reauth_block(state, tool_name, callback_context)
    if _reauth is not None:
        return _reauth

    # A tool declared level 0 in TOOL_MIN_AUTH (public rates, pure calculators)
    # needs no customer identity, so lacking customer_id must not block it.
    # Without this, BT-1 ran ahead of BT-3 and rejected tools the policy map
    # explicitly marks "0  # public rates" with AUTH_LEVEL_INSUFFICIENT. The
    # model then re-planned against a misleading error, costing extra ~19.5k-token
    # LLM round trips per turn and inventing tool arguments it was never given.
    # BT-1: Trusted ID injection (also recover from customer_profile/auth_state/customerId if flat key was cleared)
    customer_id = (state.get("customer_id", "")
                   or _cust(state).get("customer_id", "")
                   or _auth(state).get("customer_id", "")
                   or _first_nonempty(state, "customerId"))
    if customer_id and not state.get("customer_id"):
        state["customer_id"] = customer_id
    if tool_name in {'acn_identity_security_hub', 'call_identity_hub'} and customer_id:
        req_str = str(input_dict.get("request", "") or "")
        if customer_id not in req_str:
            lvl_str = _auth(state).get("level", "") or state.get("auth_level", "0")
            input_dict["request"] = f"[session customer_id={customer_id} auth_level={lvl_str}] {req_str}".strip()
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
    auth_level = max(int(_auth(state).get("level", "0") or "0"), int(state.get("auth_level", "0") or "0"), (2 if customer_id and str(state.get("authentication_status", "")).lower() == "true" else 0))
    if _pin_grant_fresh(state):
        auth_level = max(auth_level, 3)   # the PIN verified for this request also covers the write-action step-up
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
        _fsw_confirm = _confirm_block(_fsw_cfg, state, input_dict, callback_context)
        if _fsw_confirm:
            return _fsw_confirm
        _fsw_err = _fsw_prepare(_fsw_cfg, state, input_dict, auth_level)
        if _fsw_err:
            return _fsw_err
        return None

    # BT-4: Step-up enforcement
    if tool_name in STEP_UP_OPS:
        if (auth_level < 3 or not _auth(state).get("step_up_action_hash")) and not _pin_grant_fresh(state):
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
