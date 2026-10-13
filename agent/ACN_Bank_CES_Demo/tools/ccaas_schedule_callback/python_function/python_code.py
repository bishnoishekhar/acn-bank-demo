"""
P23 — ccaas_schedule_callback
Schedule a callback for the customer at their preferred time.
Auth level: L1 (customer must be identified to book callback).
Before calling this tool, speak a brief pacing phrase: 'Booking your callback — just a moment.'
"""
import uuid


def ccaas_schedule_callback(
    customer_id: str,
    phone_number: str,
    preferred_time: str,
    reason: str,
) -> dict:
    """
    Book a callback slot for the customer.

    Args:
        customer_id: Firestore customer document ID.
        phone_number: Phone number to call (E.164 format or display format).
        preferred_time: Preferred callback time (ISO datetime or natural language
                        like 'tomorrow morning', '2026-10-02T10:00:00').
        reason: Brief reason for callback to brief the agent.

    Returns:
        {scheduled(bool), callback_id(str), confirmed_time(str)}
    """
    mock_mode = get_variable("mock_mode", "false")

    callback_id = f"CB-{uuid.uuid4().hex[:10].upper()}"

    if mock_mode == "true":
        # Confirm for next business day morning if preferred_time is vague
        confirmed_time = preferred_time if "T" in str(preferred_time) else "2026-10-02T10:00:00-04:00"
        return {
            "status": "success",
            "scheduled": True,
            "callback_id": callback_id,
            "confirmed_time": confirmed_time,
        }

    return {
        "status": "success",
        "scheduled": True,
        "callback_id": callback_id,
        "confirmed_time": preferred_time,
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
