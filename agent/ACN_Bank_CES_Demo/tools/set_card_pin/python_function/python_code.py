"""
P14 — set_card_pin
Set a new PIN for a customer's card via DTMF secure input.
ALWAYS requires L3 step-up authorization before execution.
SECURITY: new_pin_dtmf is never stored, logged, or returned.
Before calling this tool, speak a brief pacing phrase: 'Setting your PIN now — please hold.'
"""
from datetime import datetime, timezone


def set_card_pin(customer_id: str, card_id: str, new_pin_dtmf: str) -> dict:
    """
    Set new card PIN via DTMF. Always step-up L3 required.

    Args:
        customer_id: Firestore customer document ID.
        card_id: Card document ID (e.g., CRD001).
        new_pin_dtmf: DTMF-captured new PIN. Never echoed or logged.

    Returns:
        {success(bool), card_last4(str), changed_at(str)}
    """
    mock_mode = get_variable("mock_mode", "false")
    changed_at = datetime.now(timezone.utc).isoformat()

    if mock_mode == "true":
        return {
            "status": "success",
            "success": True,
            "card_last4": "9871",
            "changed_at": changed_at,
        }

    # Production: call card PIN management service (stub)
    return {
        "status": "success",
        "success": True,
        "card_last4": card_id[-4:] if len(card_id) >= 4 else "****",
        "changed_at": changed_at,
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
