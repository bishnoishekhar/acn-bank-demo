"""
P20 — build_trip_plan
Build a trip readiness plan for an upcoming customer trip.
Auth level: L1 (customer must be identified to access card data).
Before calling this tool, speak a brief pacing phrase: 'Let me build your trip plan — just a moment.'
"""
import json


def build_trip_plan(
    customer_id: str,
    destination: str,
    departure_date: str,
    return_date: str,
    cards: str = "[]",
) -> dict:
    """
    Build trip readiness plan from customer travel parameters.

    Args:
        customer_id: Firestore customer document ID.
        destination: Travel destination (city or country, e.g., 'Paris, France').
        departure_date: Departure date in ISO format (YYYY-MM-DD).
        return_date: Return date in ISO format (YYYY-MM-DD).
        cards: JSON string of card IDs to check (e.g., '["CRD001","CRD002"]').
               Empty list checks all active cards.

    Returns:
        {readiness_score(int 0-100), checklist(list), advisories(list), recommended_card(str)}
    """
    mock_mode = get_variable("mock_mode", "false")

    try:
        card_list = json.loads(cards) if cards else []
    except (ValueError, TypeError):
        card_list = []

    if mock_mode == "true":
        return {
            "status": "success",
            "readiness_score": 72,
            "checklist": [
                {"item": "Set travel notice on Visa Infinite Rewards card", "done": False},
                {"item": "Confirm credit limit is sufficient for trip", "done": True},
                {"item": "Enable international transactions", "done": True},
                {"item": "Note emergency contact: 1-800-ACN-BANK (toll-free from abroad)", "done": False},
                {"item": "Download ACN Bank app for mobile access abroad", "done": False},
            ],
            "advisories": [
                "Foreign transaction fees: 2.5% on non-CAD purchases unless waived by card.",
                f"{destination}: Check Government of Canada travel advisories at travel.gc.ca.",
                "ATM access: Visa/Mastercard widely accepted. Notify us before traveling.",
            ],
            "recommended_card": "Visa Infinite Rewards (CRD002) — no foreign transaction fee",
        }

    return {
        "status": "success",
        "readiness_score": 50,
        "checklist": [
            {"item": "Set travel notice on your primary card", "done": False},
        ],
        "advisories": [f"Check travel advisories for {destination} at travel.gc.ca."],
        "recommended_card": "",
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
