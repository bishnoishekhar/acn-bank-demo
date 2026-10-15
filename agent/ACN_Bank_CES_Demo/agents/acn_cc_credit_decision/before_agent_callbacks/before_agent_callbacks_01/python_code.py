# NOTE: pruned to the subset reachable from this file's entrypoint.
# CES uploads each callback as a standalone python_code string (no shared
# imports), so the full module was duplicated into all 155 files. Regenerate
# with scripts/prune_callbacks.py after editing the canonical module.
"""
ACN Bank CES Demo — Shared Callback Module
All GECX callbacks delegate here. Platform globals (CallbackContext, Content, Part,
LlmResponse, LlmRequest, Tool) are auto-provided at runtime — do NOT import them.
Everything else MUST be explicitly imported.
"""

import json

import logging

from datetime import datetime, timezone, timedelta

from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── JSON group helpers ──────────────────────────────────────────────────────
def _auth(state):  return json.loads(state.get("auth_state",          "{}") or "{}")

def _cnt(state):   return json.loads(state.get("session_counters",    "{}") or "{}")

def _set_auth(state, **kw): a=_auth(state); a.update(kw); state["auth_state"]          = json.dumps(a)

def _set_cnt(state,  **kw): c=_cnt(state);  c.update(kw); state["session_counters"]   = json.dumps(c)

# ---------------------------------------------------------------------------
# BA: before_agent_callback
# ---------------------------------------------------------------------------
def before_agent_callback_impl(callback_context) -> Optional[object]:
    """
    BA-1 through BA-4 + voice_name_confirmation.
    CRITICAL: Must guard with channel_locked check to prevent re-running.
    """
    state = callback_context.state

    # BA-2: Idle expiry — run every turn regardless of channel_locked
    now_iso = datetime.now(timezone.utc).isoformat()
    auth_expires_at = _auth(state).get("expires_at", "")
    if auth_expires_at:
        try:
            expires = datetime.fromisoformat(auth_expires_at)
            auth_level = int(_auth(state).get("level", "0") or "0")
            if datetime.now(timezone.utc) > expires and auth_level >= 2:
                _set_auth(state, level="1")
                logger.info("auth_expired: dropped to L1")
        except (ValueError, TypeError):
            pass

    # BA-3: Step-up expiry
    step_up_valid_until = _auth(state).get("step_up_valid_until", "")
    if step_up_valid_until:
        try:
            step_up_expires = datetime.fromisoformat(step_up_valid_until)
            if datetime.now(timezone.utc) > step_up_expires:
                auth_level = int(_auth(state).get("level", "0") or "0")
                _set_auth(state, level=str(min(auth_level, 2)),
                          step_up_action_hash="", step_up_valid_until="")
        except (ValueError, TypeError):
            pass

    # BA-4: Turn counter + activity timestamp
    turn_count = int(_cnt(state).get("turns", "0") or "0")
    _set_cnt(state, turns=str(turn_count + 1))
    expires_dt = datetime.now(timezone.utc) + timedelta(seconds=900)
    _set_auth(state, last_activity=now_iso, expires_at=expires_dt.isoformat())

    # BA-1: Session init — only once (guarded by channel_locked)
    if not state.get("channel_locked"):
        # Bridge telephony-caller-id (platform dashes) -> telephony_caller_id (declared underscores)
        raw_caller_id = state.get("telephony-caller-id") or state.get("telephony_caller_id", "")
        if raw_caller_id:
            state["telephony_caller_id"] = raw_caller_id

        # Detect channel
        if state.get("telephony_caller_id"):
            state["channel"] = "voice"
        elif state.get("whatsapp_wa_id"):
            state["channel"] = "whatsapp"
        else:
            state["channel"] = "webchat"

        state["channel_locked"] = True
        state["widgets_enabled"] = (state["channel"] == "webchat")
        state["dtmf_enabled"] = False

        # Load after_hours
        _compute_after_hours(state)

    return None

def _compute_after_hours(state: dict[str, Any]) -> None:
    """Compute after_hours based on America/Toronto business hours."""
    try:
        from datetime import datetime
        import zoneinfo
        tz = zoneinfo.ZoneInfo("America/Toronto")
        now_local = datetime.now(tz)
        hour = now_local.hour
        weekday = now_local.weekday()  # 0=Monday, 6=Sunday
        if weekday >= 5:  # Weekend
            state["after_hours"] = True
        elif hour < 8 or hour >= 20:  # Before 8am or after 8pm
            state["after_hours"] = True
        else:
            state["after_hours"] = False
    except Exception:
        state["after_hours"] = False

# --- Entry point ---
def before_agent_callback(callback_context: CallbackContext) -> Optional[Content]:
    return before_agent_callback_impl(callback_context)
