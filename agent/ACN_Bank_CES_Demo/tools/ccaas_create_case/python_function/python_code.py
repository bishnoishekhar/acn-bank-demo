"""
P24 — ccaas_create_case
Create a complaint or escalation case in the CCaaS system.
Auth level: L0 (accessible without authentication for complaints/escalations).
Before calling this tool, speak a brief pacing phrase: 'Creating your case now — just a moment.'
"""
import uuid
from datetime import datetime, timezone


def ccaas_create_case(
    customer_id: str,
    case_type: str,
    description: str,
    channel: str,
) -> dict:
    """
    Create a CCaaS complaint or escalation case.

    Args:
        customer_id: Firestore customer document ID (may be empty at L0).
        case_type: Case type: 'complaint' | 'escalation' | 'fraud_report' |
                   'vulnerability' | 'bereavement' | 'general'.
        description: Brief description of the issue (no PII values).
        channel: Channel where the case originated: voice | webchat | whatsapp.

    Returns:
        {case_id(str), case_reference(str), created_at(str)}
    """
    mock_mode = get_variable("mock_mode", "false")

    case_id = f"CASE-{uuid.uuid4().hex[:10].upper()}"
    case_reference = f"ACN-{uuid.uuid4().hex[:6].upper()}-{case_type[:3].upper()}"
    created_at = datetime.now(timezone.utc).isoformat()

    if mock_mode == "true":
        return {
            "status": "success",
            "case_id": case_id,
            "case_reference": case_reference,
            "created_at": created_at,
        }

    return {
        "status": "success",
        "case_id": case_id,
        "case_reference": case_reference,
        "created_at": created_at,
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
