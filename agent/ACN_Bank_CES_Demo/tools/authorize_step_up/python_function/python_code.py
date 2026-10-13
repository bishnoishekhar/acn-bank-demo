import hashlib
from datetime import datetime, timezone, timedelta
from typing import Any

STEP_UP_VALIDITY_SECONDS = 120

def authorize_step_up(action_type: str, action_hash: str = "") -> dict[str, Any]:
    """
    M5 step-up: L2 → L3.
    action_type: new_payee | threshold | wire | limit_increase | contact_change | unfreeze | pin_change | payee_edit
    Returns step_up_valid_until and step_up_action_hash (120s single-action validity).
Called silently during step-up authorization. Do NOT speak any pacing phrase before calling this tool.
"""
    if not action_type:
        return {"status": "validation_error", "code": "MISSING_ACTION_TYPE", "data": {}}

    now = datetime.now(timezone.utc)
    valid_until = now + timedelta(seconds=STEP_UP_VALIDITY_SECONDS)

    # Generate deterministic action hash
    if not action_hash:
        action_hash = hashlib.sha256(f"{action_type}:{now.isoformat()}".encode()).hexdigest()[:32]

    set_variable("step_up_action_hash", action_hash)
    set_variable("step_up_valid_until", valid_until.isoformat())
    set_variable("auth_level", "3")
    set_variable("step_up_required", "false")

    return {
        "status": "success",
        "data": {
            "authLevel": 3,
            "authMode": "step_up",
            "actionType": action_type,
            "stepUpActionHash": action_hash,
            "stepUpValidUntil": valid_until.isoformat(),
            "validitySeconds": STEP_UP_VALIDITY_SECONDS,
            "authTimestamp": now.isoformat(),
            "message": f"Step-up authorization granted for {action_type}. Valid for {STEP_UP_VALIDITY_SECONDS} seconds."
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
