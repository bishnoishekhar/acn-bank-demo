from typing import Any

VALID_IDENTIFIER_TYPES = {"caller_id", "phone", "email", "card_dob_postal", "wa_id", "webchat_sso"}

def identify_customer(identifier_type: str, identifier_value: str, channel: str = "voice") -> dict[str, Any]:
    """
    M5 identification tool: L0 → L1.
    identifier_type: caller_id | phone | email | card_dob_postal | wa_id | webchat_sso
    Returns customer_id, auth_level=1, identified_by on success.
Called silently during initial caller lookup. Do NOT speak any pacing phrase before calling this tool.
"""
    if not identifier_type or not identifier_value:
        return {
            "status": "validation_error",
            "code": "MISSING_PARAMS",
            "data": {"message": "identifier_type and identifier_value are required."}
        }

    if identifier_type not in VALID_IDENTIFIER_TYPES:
        return {
            "status": "validation_error",
            "code": "INVALID_IDENTIFIER_TYPE",
            "data": {"validTypes": list(VALID_IDENTIFIER_TYPES)}
        }

    CALLER_ID_MAP = {
        "+14165551234": "CUST_DOC_1988",
        "+15141234567": "CUST-9921-X",
        "+12369274375": "CUST-9921-X",
        "+14165559999": "CUST-PREMIUM-001",
        "+14165559201": "CUST-PREMIUM-001",
        "+16135551000": "CUST-WEALTH-001",
        "+15147773301": "CUST-WEALTH-001",
        "+12269274374": "CUST_DOC_1988",
        "+12178582973": "CUST_DOC_1988",
        "+15195551234": "6oq3lBNGOFWfqOamn9ob",
        "+16135554401": "CUST-MORTGAGE-001",
        "+14165558801": "CUST-CARDAPP-001",
        "+16474440001": "CUST-DISPUTE-INELIGIBLE",
        "+14165559901": "CUST-MKTOPT-001",
        "+14165559902": "CUST-RESTRICTED-001",
        "+14169990001": "CUST-FRAUD-001",
        "+14169990002": "CUST-VULNERABLE-001",
        "+14169990003": "CUST-DISPUTE-INELIG-001",
    }
    PHONE_MAP = {
        "4165551234": "CUST_DOC_1988",
        "2269274374": "CUST_DOC_1988",
        "2269374374": "CUST_DOC_1988",
        "22699274374": "CUST_DOC_1988",
        "2178582973": "CUST_DOC_1988",
        "7744112233": "CUST_DOC_7777",
        "5195551234": "6oq3lBNGOFWfqOamn9ob",
        "1234567890": "6oq3lBNGOFWfqOamn9ob",
        "5141234567": "CUST-9921-X",
        "2369274375": "CUST-9921-X",
        "428765091":  "CUST-9921-X",
        "4165559999": "CUST-PREMIUM-001",
        "4165559201": "CUST-PREMIUM-001",
        "8821003344": "CUST-PREMIUM-001",
        "6135551000": "CUST-WEALTH-001",
        "5147773301": "CUST-WEALTH-001",
        "5500778899": "CUST-WEALTH-001",
        "6135554401": "CUST-MORTGAGE-001",
        "9910221133": "CUST-MORTGAGE-001",
        "4165558801": "CUST-CARDAPP-001",
        "3310445566": "CUST-CARDAPP-001",
        "6474440001": "CUST-DISPUTE-INELIGIBLE",
        "4165559901": "CUST-MKTOPT-001",
        "9901001122": "CUST-MKTOPT-001",
        "4165559902": "CUST-RESTRICTED-001",
        "9902001122": "CUST-RESTRICTED-001",
        "4169990001": "CUST-FRAUD-001",
        "4169990002": "CUST-VULNERABLE-001",
        "4169990003": "CUST-DISPUTE-INELIG-001",
    }

    customer_id = ""
    if identifier_type == "caller_id":
        customer_id = CALLER_ID_MAP.get(identifier_value, "CUST_DOC_1988")
    elif identifier_type == "phone":
        digits = "".join(ch for ch in str(identifier_value) if ch.isdigit())
        if len(digits) == 11 and digits.startswith("1"):
            digits = digits[1:]
        customer_id = PHONE_MAP.get(digits, "CUST_DOC_1988")
    elif identifier_type in {"email", "wa_id", "webchat_sso"}:
        val_clean = str(identifier_value).strip()
        if val_clean in DEMO_EMAIL_OR_ID_MAP:
            customer_id = DEMO_EMAIL_OR_ID_MAP[val_clean]
        else:
            customer_id = "CUST_DOC_1988"
    elif identifier_type == "card_dob_postal":
        customer_id = "CUST_DOC_1988"

    if not customer_id:
        return {
            "status": "business_error",
            "code": "CUSTOMER_NOT_FOUND",
            "data": {"message": "No customer found matching the provided identifier."}
        }

    set_variable("customer_id", customer_id)
    set_variable("auth_level", "1")
    set_variable("identified_by", identifier_type)
    set_variable("inject_preferred_name", "true")

    return {
        "status": "success",
        "data": {
            "customerId": customer_id,
            "authLevel": 1,
            "identifiedBy": identifier_type,
            "channel": channel,
            "identificationTimestamp": "2026-09-30T10:00:00Z"
        }
    }

DEMO_EMAIL_OR_ID_MAP = {
    "CUST_DOC_1988": "CUST_DOC_1988",
    "CUST_DOC_7777": "CUST_DOC_7777",
    "6oq3lBNGOFWfqOamn9ob": "6oq3lBNGOFWfqOamn9ob",
    "john.doe@example.com": "6oq3lBNGOFWfqOamn9ob",
    "CUST-9921-X": "CUST-9921-X",
    "CUST-PREMIUM-001": "CUST-PREMIUM-001",
    "sophie.tremblay@example.com": "CUST-PREMIUM-001",
    "CUST-WEALTH-001": "CUST-WEALTH-001",
    "a.fontaine@example.com": "CUST-WEALTH-001",
    "CUST-MORTGAGE-001": "CUST-MORTGAGE-001",
    "priya.sharma@example.com": "CUST-MORTGAGE-001",
}

# agent_action: "An unexpected error occurred — please inform the customer and try again."
