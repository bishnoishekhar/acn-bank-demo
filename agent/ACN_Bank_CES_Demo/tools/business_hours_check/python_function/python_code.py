from datetime import datetime, timezone, timedelta
from typing import Any

BUSINESS_START_HOUR = 8   # 8:00 AM
BUSINESS_END_HOUR = 20    # 8:00 PM

def business_hours_check(timezone_name: str = "America/Toronto") -> dict[str, Any]:
    """Returns after_hours bool and next open time for ACN Bank contact centre.
Called silently at session start. Do NOT speak any pacing phrase before calling this tool.
"""
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(timezone_name)
        now_local = datetime.now(tz)
    except Exception:
        now_local = datetime.now(timezone.utc)

    hour = now_local.hour
    weekday = now_local.weekday()  # 0=Monday, 6=Sunday
    is_weekend = weekday >= 5

    if is_weekend:
        after_hours = True
        # Next Monday at 8am
        days_until_monday = (7 - weekday) % 7 or 7
        next_open = now_local.replace(hour=BUSINESS_START_HOUR, minute=0, second=0, microsecond=0)
        next_open = next_open + timedelta(days=days_until_monday)
        next_open_str = next_open.strftime("%A, %B %d at %I:%M %p")
    elif hour < BUSINESS_START_HOUR:
        after_hours = True
        next_open = now_local.replace(hour=BUSINESS_START_HOUR, minute=0, second=0, microsecond=0)
        next_open_str = f"today at {BUSINESS_START_HOUR}:00 AM"
    elif hour >= BUSINESS_END_HOUR:
        after_hours = True
        tomorrow = now_local + timedelta(days=1)
        next_open = tomorrow.replace(hour=BUSINESS_START_HOUR, minute=0, second=0, microsecond=0)
        if tomorrow.weekday() >= 5:
            next_open_str = "Monday at 8:00 AM"
        else:
            next_open_str = f"tomorrow at {BUSINESS_START_HOUR}:00 AM"
    else:
        after_hours = False
        next_open_str = f"Open until {BUSINESS_END_HOUR}:00 PM today"

    return {
        "status": "success",
        "data": {
            "afterHours": after_hours,
            "nextOpenTime": next_open_str,
            "currentTime": now_local.strftime("%Y-%m-%d %H:%M %Z"),
            "businessHours": "Monday–Friday 8:00 AM – 8:00 PM ET",
            "timezone": timezone_name
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
