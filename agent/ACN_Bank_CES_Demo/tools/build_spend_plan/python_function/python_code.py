"""
P21 — build_spend_plan
Budget allocation plan from trip parameters.
No auth required — public/informational.
Before calling this tool, speak a brief pacing phrase: 'Putting together your budget plan now.'
"""


def build_spend_plan(
    destination: str,
    duration_days: int,
    travel_style: str = "standard",
) -> dict:
    """
    Generate a budget allocation plan for a trip.

    Args:
        destination: Travel destination (city or country).
        duration_days: Number of days for the trip.
        travel_style: Budget tier — 'budget' | 'standard' (default) | 'premium'.

    Returns:
        {daily_budget_cad, categories(list), total_estimated_cad}
    """
    if duration_days <= 0:
        return {
            "status": "validation_error",
            "error": "Duration must be at least 1 day.",
        }

    # Style multipliers
    style_multipliers = {"budget": 0.6, "standard": 1.0, "premium": 2.0}
    multiplier = style_multipliers.get(travel_style, 1.0)

    # Base daily CAD estimates for common destinations
    _base_daily = {
        "europe": 280,
        "usa": 220,
        "caribbean": 250,
        "asia": 180,
        "mexico": 160,
        "default": 220,
    }

    dest_lower = destination.lower()
    base = 220
    for key, val in _base_daily.items():
        if key in dest_lower:
            base = val
            break

    daily_budget = round(base * multiplier, 2)
    total_estimated = round(daily_budget * duration_days, 2)

    categories = [
        {"category": "Accommodation", "daily_cad": round(daily_budget * 0.40, 2)},
        {"category": "Food & Dining", "daily_cad": round(daily_budget * 0.25, 2)},
        {"category": "Transportation", "daily_cad": round(daily_budget * 0.15, 2)},
        {"category": "Activities & Entertainment", "daily_cad": round(daily_budget * 0.12, 2)},
        {"category": "Miscellaneous", "daily_cad": round(daily_budget * 0.08, 2)},
    ]

    return {
        "status": "success",
        "daily_budget_cad": daily_budget,
        "categories": categories,
        "total_estimated_cad": total_estimated,
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
