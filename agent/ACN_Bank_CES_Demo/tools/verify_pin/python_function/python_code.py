"""
P4 — verify_pin
Validate the customer's telephone banking PIN received via masked DTMF input.
Auth level: L1 required; sets auth_level=2 on success.
SECURITY: pin_masked must never be logged or stored in session state.
Before calling this tool, speak a brief pacing phrase: 'Verifying your PIN now.'
"""


import time


def verify_pin(customer_id: str, pin_masked: str) -> dict:
    """
    Validate telephone banking PIN via masked DTMF input.

    Args:
        customer_id: Firestore customer document ID.
        pin_masked: DTMF-captured PIN, masked (e.g., '*****').

    Returns:
        {verified(bool), attempts_left(int), auth_level(int)}
    """
    mock_mode = get_variable("mock_mode", "false")

    # Track attempts
    attempts = int(get_variable("pin_attempts", "0") or "0") + 1
    set_variable("pin_attempts", str(attempts))

    if mock_mode == "true":
        verified = pin_masked == "*****" or (len(pin_masked) >= 4)
        if verified:
            set_variable("auth_level", "2")
            set_variable("auth_mode", "pin")
            set_variable("pin_verified_at", str(int(time.time())))
        return {
            "status": "success",
            "verified": verified,
            "customer_id": customer_id,
            "attempts_left": max(0, 3 - attempts),
            "auth_level": 2 if verified else int(get_variable("auth_level", "1") or "1"),
        }

    # Demo PIN map: customer_id → 4-digit PIN
    DEMO_PIN_MAP = {
        "CUST_DOC_1988":           "2244",
        "CUST_DOC_7777":           "1234",
        "6oq3lBNGOFWfqOamn9ob":    "1234",
        "CUST-9921-X":             "1357",
        "CUST-PREMIUM-001":        "9876",
        "CUST-WEALTH-001":         "4321",
        "CUST-MORTGAGE-001":       "1234",
        "CUST-CARDAPP-001":        "1234",
        "CUST-DISPUTE-INELIGIBLE": "1234",
        "CUST-MKTOPT-001":         "1234",
        "CUST-RESTRICTED-001":     "1234",
        "CUST-FRAUD-001":          "1234",
        "CUST-VULNERABLE-001":     "1234",
        "CUST-DISPUTE-INELIG-001": "1234",
    }
    submitted = pin_masked.replace("*", "").replace(" ", "")

    # Disambiguate shared mobile number (+12178582973) between CUST_DOC_1988 (2244) and CUST_DOC_7777 (1234)
    if customer_id == "CUST_DOC_1988" and submitted == "1234":
        customer_id = "CUST_DOC_7777"
        set_variable("customer_id", customer_id)
    elif customer_id == "CUST_DOC_7777" and submitted == "2244":
        customer_id = "CUST_DOC_1988"
        set_variable("customer_id", customer_id)

    demo_pin = DEMO_PIN_MAP.get(customer_id, "2244")
    # Accept typed digits matching demo PIN, or all-asterisk DTMF of correct length
    verified = (bool(submitted) and submitted == demo_pin) or \
               (not submitted and len(pin_masked.replace(" ", "")) == 4 and bool(demo_pin))
    if verified:
        set_variable("customer_id", customer_id)
        set_variable("auth_level", "2")
        set_variable("auth_mode", "pin")
        set_variable("pin_verified_at", str(int(time.time())))   # the PIN was verified NOW: reported to the caller in the hub trailer
    return {
        "status": "success",
        "verified": verified,
        "customer_id": customer_id,
        "attempts_left": max(0, 3 - attempts),
        "auth_level": 2 if verified else int(get_variable("auth_level", "1") or "1"),
        "auth_mode": "pin" if verified else "",
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
