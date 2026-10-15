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

    # Stub: caller-ID lookup maps to test customer
    CALLER_ID_MAP = {
        "+14165551234": "CUST_DOC_1988",
        "+15141234567": "CUST-9921-X",
        "+14165559999": "CUST-PREMIUM-001",
        "+16135551000": "CUST-WEALTH-001",
        "+12269274374": "CUST_DOC_1988",
    }
    PHONE_MAP = {
        "4165551234": "CUST_DOC_1988",
        "5141234567": "CUST-9921-X",
        "2269274374": "CUST_DOC_1988",
        "2269374374": "CUST_DOC_1988",
    }

    customer_id = ""
    if identifier_type == "caller_id":
        customer_id = CALLER_ID_MAP.get(identifier_value, "CUST_DOC_1988")
    elif identifier_type == "phone":
        normalized = identifier_value.replace("+1", "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
        # Fall back to CUST_DOC_1988, matching the caller_id branch above.
        # The previous fallback ("6oq3lBNGOFWfqOamn9ob") has no entry in
        # verify_pin's DEMO_PIN_MAP, so any unrecognised number identified
        # successfully at L1 and then could never clear PIN verification —
        # verify_pin compared the submitted PIN against an empty string and
        # returned verified=False forever, with no error explaining why.
        customer_id = PHONE_MAP.get(normalized, "CUST_DOC_1988")
    elif identifier_type in {"email", "wa_id", "webchat_sso"}:
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

# agent_action: "An unexpected error occurred — please inform the customer and try again."
