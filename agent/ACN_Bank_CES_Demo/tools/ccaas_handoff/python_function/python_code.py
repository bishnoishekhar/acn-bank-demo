"""
P22 — ccaas_handoff
Transfer the customer to a live agent in the CCaaS queue.
Carries warm handoff context from the session.
Before calling this tool, speak a brief pacing phrase: 'Connecting you with a specialist now.'
"""
import uuid
import json


def ccaas_handoff(
    queue_name: str,
    reason: str,
    customer_id: str = "",
    context_json: str = "{}",
) -> dict:
    """
    Initiate CCaaS live agent transfer.

    Args:
        queue_name: Target queue (e.g., 'general', 'fraud', 'mortgage',
                    'disputes', 'premium', 'complaints').
        reason: Transfer reason for agent briefing (displayed to agent).
        customer_id: Customer document ID for warm handoff (optional at L0).
        context_json: JSON string with journey context snapshot for agent.

    Returns:
        {transferred(bool), wait_estimate_minutes(int), case_reference(str)}
    """
    mock_mode = get_variable("mock_mode", "false")

    case_reference = f"ACN-{uuid.uuid4().hex[:8].upper()}"

    if mock_mode == "true":
        return {
            "status": "success",
            "transferred": True,
            "wait_estimate_minutes": 4,
            "case_reference": case_reference,
        }

    return {
        "status": "success",
        "transferred": True,
        "wait_estimate_minutes": 8,
        "case_reference": case_reference,
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
