"""
P2 — issue_otp
Generate an OTP challenge and send it to the customer's registered mobile.
Auth level: L1 (customer must be identified before OTP can be issued).
Before calling this tool, speak a brief pacing phrase: 'Sending your one-time code now.'
"""
import uuid
from datetime import datetime, timezone, timedelta


def issue_otp(customer_id: str, preferred_channel: str = "sms") -> dict:
    """
    Generate OTP challenge and dispatch to registered mobile.

    Args:
        customer_id: Firestore customer document ID.
        preferred_channel: Delivery channel — 'sms' (default) | 'voice' | 'email'.

    Returns:
        {otp_request_id, expires_in_seconds, masked_destination}
    """
    mock_mode = get_variable("mock_mode", "false")

    if mock_mode == "true" or not customer_id:
        otp_request_id = f"OTP-{uuid.uuid4().hex[:12].upper()}"
        set_variable("otp_request_id", otp_request_id)
        return {
            "status": "success",
            "otp_request_id": otp_request_id,
            "expires_in_seconds": 300,
            "masked_destination": "+1 (416) ***-4471",
            "channel": preferred_channel,
        }

    # Production: call OTP service (stub — replace with real integration)
    otp_request_id = f"OTP-{uuid.uuid4().hex[:12].upper()}"
    set_variable("otp_request_id", otp_request_id)
    return {
        "status": "success",
        "otp_request_id": otp_request_id,
        "expires_in_seconds": 300,
        "masked_destination": "***-***-****",
        "channel": preferred_channel,
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
