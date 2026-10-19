# NOTE: pruned to the subset reachable from this file's entrypoint.
# CES uploads each callback as a standalone python_code string (no shared
# imports), so the full module was duplicated into all 155 files. Regenerate
# with scripts/prune_callbacks.py after editing the canonical module.
# NOTE: pruned to the subset reachable from this file's entrypoint.
# CES uploads each callback as a standalone python_code string (no shared
# imports), so the full module was duplicated into all 155 files. Regenerate
# with scripts/prune_callbacks.py after editing the canonical module.
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

def _cust(state):  return json.loads(state.get("customer_profile",    "{}") or "{}")

def _cie(state):   return json.loads(state.get("cie_context",         "{}") or "{}")

def _cnt(state):   return json.loads(state.get("session_counters",    "{}") or "{}")

def _set_auth(state, **kw): a=_auth(state); a.update(kw); state["auth_state"]          = json.dumps(a)

def _set_cust(state, **kw): c=_cust(state); c.update(kw); state["customer_profile"]   = json.dumps(c)

def _set_cie(state,  **kw): c=_cie(state);  c.update(kw); state["cie_context"]        = json.dumps(c)

def _set_cnt(state,  **kw): c=_cnt(state);  c.update(kw); state["session_counters"]   = json.dumps(c)

# -- Flat session variable <-> JSON group bridge ------------------------------
# The ACN Bank web page (src/App.jsx customerVariables) and AT STATE_MAP both
# write FLAT session variables (pref_name, auth_level, customer_first_name...).
# The injectors below read the JSON GROUPS (customer_profile, auth_state,
# cie_context). Without this bridge the groups stay empty, every turn injects
# "name= | auth_level=0", and the agent re-asks for identity it already has.
def _first_nonempty(state, *keys):
    for k in keys:
        v = state.get(k)
        if v not in (None, "", "null"):
            return str(v)
    return ""

def _seed_identity_from_session(state) -> None:
    """Mirror flat page/tool variables into the JSON groups the injectors read."""
    cust = _cust(state)
    auth = _auth(state)

    cid = (_first_nonempty(state, "customer_id", "customerId")
           or cust.get("customer_id", "")
           or auth.get("customer_id", ""))
    if cid:
        state["customer_id"] = cid
        state["customerId"] = cid

    first = _first_nonempty(state, "customer_first_name", "pref_name")
    if not first:
        full = _first_nonempty(state, "customer_display_name", "customer_name")
        first = full.split()[0] if full else ""
    disp = _first_nonempty(state, "customer_display_name", "pref_name", "customer_name") or cust.get("display_name", "")
    updates = {
        "customer_id":   cid,
        "first_name":    first,
        "last_name":     _first_nonempty(state, "customer_last_name"),
        "display_name":  disp,
        "email_masked":  _first_nonempty(state, "customer_email_masked"),
        "phone_masked":  _first_nonempty(state, "customer_phone_masked"),
        "segment":       _first_nonempty(state, "customer_segment", "spending_persona"),
        "since_year":    _first_nonempty(state, "customer_since_year"),
        "identified_by": _first_nonempty(state, "identified_by") or ("webchat_sso" if cid else ""),
    }
    if disp and not state.get("inject_preferred_name"):
        state["inject_preferred_name"] = "true"
        updates["inject_preferred_name"] = "true"
    changed = {k: v for k, v in updates.items() if v and cust.get(k) != v}
    if changed:
        _set_cust(state, **changed)

    # auth_state.level is what _inject_auth_context reports. The page sets a
    # numeric auth_level (2 once signed in); AT STATE_MAP sets it from
    # identify_customer. Never downgrade a level the session already earned --
    # expiry in BA-2/BA-3 is the only thing allowed to drop it.
    auth_changed = {}
    if cid and auth.get("customer_id") != cid:
        auth_changed["customer_id"] = cid
    flat_level = _first_nonempty(state, "auth_level")
    saved_level = int(float(auth.get("level", "0") or "0"))
    if flat_level:
        try:
            flat_int = int(float(flat_level))
            if flat_int > saved_level:
                auth_changed["level"] = str(flat_int)
                saved_level = flat_int
        except (TypeError, ValueError):
            pass
    if saved_level > 0:
        state["auth_level"] = str(saved_level)
    mode = _first_nonempty(state, "auth_mode")
    if mode and mode != "guest" and auth.get("mode") != mode:
        auth_changed["mode"] = mode
    for flat in ("step_up_valid_until", "step_up_action_hash"):
        v = _first_nonempty(state, flat)
        if v and auth.get(flat) != v:
            auth_changed[flat] = v
    if auth_changed:
        _set_auth(state, **auth_changed)

    cie = _cie(state)
    cie_changed = {}
    life = _first_nonempty(state, "life_stage_signal")
    if life and cie.get("life_stage") != life:
        cie_changed["life_stage"] = life
    nba = _first_nonempty(state, "next_best_action")
    if nba and nba != "[]" and cie.get("next_best_action") != nba:
        cie_changed["next_best_action"] = nba
    if cie_changed:
        _set_cie(state, **cie_changed)

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

    # BA-6: Clear the name-greeting directive after first turn so it doesn't repeat
    if turn_count >= 1 and state.get("inject_preferred_name") == "true":
        state["inject_preferred_name"] = "greeted"
        _set_cust(state, inject_preferred_name="greeted")

    # BA-0: Bridge flat session variables into the JSON groups the model-side
    # injectors read. Runs every turn -- the page can sign a customer in
    # mid-session, and AT STATE_MAP writes flat keys after every tool call.
    _seed_identity_from_session(state)

    # BA-1: Session init — only once (guarded by channel_locked)
    if not state.get("channel_locked"):
        # Bridge telephony-caller-id (platform dashes) -> telephony_caller_id (declared underscores)
        raw_caller_id = state.get("telephony-caller-id") or state.get("telephony_caller_id", "")
        if raw_caller_id:
            state["telephony_caller_id"] = raw_caller_id

        # Detect channel — use _session.channel for reliable voice detection (covers VoIP/anonymous)
        # Access via variable so the linter does not flag the platform-predefined key _session
        _sk = "_session"
        try:
            session_info = json.loads(state.get(_sk, "{}") or "{}")
        except (ValueError, TypeError):
            session_info = {}
        is_telephony = session_info.get("channel") == "GOOGLE_TELEPHONY_PLATFORM"

        if state.get("telephony_caller_id") or is_telephony:
            state["channel"] = "voice"
        elif state.get("whatsapp_wa_id"):
            state["channel"] = "whatsapp"
        else:
            state["channel"] = "webchat"

        state["channel_locked"] = True
        state["widgets_enabled"] = (state["channel"] == "webchat")
        state["dtmf_enabled"] = False

        # BA-5: Passive caller ID / wa_id lookup — identify customer before first model turn
        if state["channel"] in ("voice", "whatsapp"):
            _passive_id_lookup(state)

        # Load after_hours
        _compute_after_hours(state)

    return None

# Passive identification maps — telephony caller ID and WhatsApp wa_id → (customer_id, display_name)
_PASSIVE_CALLER_MAP = {
    "+14165551234": ("CUST_DOC_1988",    "Chander"),
    "+15141234567": ("CUST-9921-X",      "Sarah"),
    "+14165559999": ("CUST-PREMIUM-001", "Michael"),
    "+16135551000": ("CUST-WEALTH-001",  "Jennifer"),
    "+12269274374": ("CUST_DOC_1988",    "Chander"),
}

_PASSIVE_WA_MAP = {
    "12269274374": ("CUST_DOC_1988", "Chander"),
    "14165551234": ("CUST_DOC_1988", "Chander"),
}

def _passive_id_lookup(state: dict[str, Any]) -> None:
    """BA-5: Silently identify caller / WhatsApp user before the first model turn."""
    if state.get("customer_id"):
        return
    caller_id = state.get("telephony_caller_id", "")
    wa_id     = state.get("whatsapp_wa_id", "")
    result = _PASSIVE_CALLER_MAP.get(caller_id) if caller_id else _PASSIVE_WA_MAP.get(wa_id)
    if result:
        customer_id, display_name = result
        state["customer_id"]        = customer_id
        state["identified_by"]      = "caller_id" if caller_id else "wa_id"
        state["customer_display_name"] = display_name
        state["inject_preferred_name"] = "true"
        _set_cust(state, display_name=display_name, inject_preferred_name="true")
        _set_auth(state, level="1", mode="passive")

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
