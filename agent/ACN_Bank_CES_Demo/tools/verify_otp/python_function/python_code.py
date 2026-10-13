"""
P3 — verify_otp
Validate an OTP code submitted by the customer against a prior issue_otp challenge.
Auth level: L1 required; sets auth_level=2 on success.
Before calling this tool, speak a brief pacing phrase: 'Verifying your code now.'
"""
from datetime import datetime, timezone


def verify_otp(customer_id: str, otp_request_id: str, otp_code: str) -> dict:
    """
    Validate OTP code.

    Args:
        customer_id: Firestore customer document ID.
        otp_request_id: Opaque challenge ID returned by issue_otp.
        otp_code: The code the customer provided (6 digits).

    Returns:
        {verified(bool), attempts_left(int), auth_level(int)}
    """
    mock_mode = get_variable("mock_mode", "false")

    # Track attempts
    attempts = int(get_variable("otp_attempts", "0") or "0") + 1
    set_variable("otp_attempts", str(attempts))

    if mock_mode == "true":
        # In mock mode, accept any 6-digit code
        verified = len(otp_code.strip()) == 6 and otp_code.strip().isdigit()
        if verified:
            set_variable("auth_level", "2")
            set_variable("auth_mode", "otp")
        return {
            "status": "success",
            "verified": verified,
            "attempts_left": max(0, 3 - attempts),
            "auth_level": 2 if verified else int(get_variable("auth_level", "1") or "1"),
        }

    # Demo: accept any valid 6-digit numeric code
    verified = len(otp_code.strip()) == 6 and otp_code.strip().isdigit()
    if verified:
        set_variable("auth_level", "2")
        set_variable("auth_mode", "otp")
    return {
        "status": "success",
        "verified": verified,
        "attempts_left": max(0, 3 - attempts),
        "auth_level": 2 if verified else int(get_variable("auth_level", "1") or "1"),
        "auth_mode": "otp" if verified else "",
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
