"""
P4 — verify_pin
Validate the customer's telephone banking PIN received via masked DTMF input.
Auth level: L1 required; sets auth_level=2 on success.
SECURITY: pin_masked must never be logged or stored in session state.
Before calling this tool, speak a brief pacing phrase: 'Verifying your PIN now.'
"""


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
        # In mock mode, accept any 5-character masked PIN
        verified = len(pin_masked.replace("*", "").replace(" ", "")) == 0 and len(pin_masked) >= 5
        # Mock: accept pin_masked that is exactly 5 asterisks
        verified = pin_masked == "*****" or (len(pin_masked) >= 4)
        if verified:
            set_variable("auth_level", "2")
            set_variable("auth_mode", "pin")
        return {
            "status": "success",
            "verified": verified,
            "attempts_left": max(0, 3 - attempts),
            "auth_level": 2 if verified else int(get_variable("auth_level", "1") or "1"),
        }

    # Demo PIN map: customer_id → 4-digit PIN
    DEMO_PIN_MAP = {
        "CUST_DOC_1988":    "2244",
        "CUST-9921-X":      "1357",
        "CUST-PREMIUM-001": "9876",
        "CUST-WEALTH-001":  "4321",
    }
    demo_pin = DEMO_PIN_MAP.get(customer_id, "")
    submitted = pin_masked.replace("*", "").replace(" ", "")
    # Accept typed digits matching demo PIN, or all-asterisk DTMF of correct length
    verified = (bool(submitted) and submitted == demo_pin) or \
               (not submitted and len(pin_masked.replace(" ", "")) == 4 and bool(demo_pin))
    if verified:
        set_variable("auth_level", "2")
        set_variable("auth_mode", "pin")
    return {
        "status": "success",
        "verified": verified,
        "attempts_left": max(0, 3 - attempts),
        "auth_level": 2 if verified else int(get_variable("auth_level", "1") or "1"),
        "auth_mode": "pin" if verified else "",
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
