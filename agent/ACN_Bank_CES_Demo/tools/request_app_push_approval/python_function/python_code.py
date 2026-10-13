"""
P6 — request_app_push_approval
Send a push notification to the customer's mobile app requesting L3 action approval.
Used for WhatsApp channel and mobile app push confirmation flows.
Before calling this tool, speak a brief pacing phrase: 'Sending approval request to your app — just a moment.'
"""
import uuid


def request_app_push_approval(customer_id: str, action_description: str, action_hash: str) -> dict:
    """
    Send in-app push requesting customer approval for a high-risk action.

    Args:
        customer_id: Firestore customer document ID.
        action_description: Human-readable description shown in the push notification.
        action_hash: Hash of the action being authorized (for binding).

    Returns:
        {push_sent(bool), approval_timeout_seconds(int), push_id(str)}
    """
    mock_mode = get_variable("mock_mode", "false")

    push_id = f"PUSH-{uuid.uuid4().hex[:10].upper()}"

    if mock_mode == "true":
        set_variable("push_id", push_id)
        return {
            "status": "success",
            "push_sent": True,
            "approval_timeout_seconds": 120,
            "push_id": push_id,
        }

    # Production stub
    return {
        "status": "success",
        "push_sent": True,
        "approval_timeout_seconds": 120,
        "push_id": push_id,
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
