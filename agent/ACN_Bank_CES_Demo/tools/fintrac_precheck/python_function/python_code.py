from typing import Any

FINTRAC_THRESHOLD_CAD = 10000.0
HIGH_RISK_COUNTRIES = {"IR", "KP", "SY", "CU", "RU", "BY"}

def fintrac_precheck(amount: str, currency: str, destination_country: str, wire_type: str = "domestic") -> dict[str, Any]:
    """
    FINTRAC pre-check for wire/international transfers.
    Returns status: not_required | passed | review_required | blocked
Runs FINTRAC compliance check silently. No pacing phrase required.
"""
    if not amount or not currency:
        return {"status": "validation_error", "code": "MISSING_PARAMS", "data": {}}

    try:
        amount_float = float(amount.replace(",", ""))
    except (ValueError, TypeError):
        return {"status": "validation_error", "code": "INVALID_AMOUNT", "data": {}}

    country_upper = (destination_country or "CA").upper()
    requires_leftr = amount_float >= FINTRAC_THRESHOLD_CAD
    is_high_risk = country_upper in HIGH_RISK_COUNTRIES
    is_sanctioned = country_upper in {"KP", "IR", "SY"}

    if is_sanctioned:
        return {
            "status": "success",
            "data": {
                "checkStatus": "blocked",
                "reason": "OFAC_SANCTIONS",
                "message": "Transfer to this destination is blocked under Canadian sanctions regulations.",
                "requiresLEFTR": False,
                "requiresSTR": True,
                "amount": amount_float,
                "currency": currency,
                "destinationCountry": country_upper
            }
        }

    if is_high_risk:
        return {
            "status": "success",
            "data": {
                "checkStatus": "review_required",
                "reason": "HIGH_RISK_JURISDICTION",
                "message": "Transfer to high-risk jurisdiction requires enhanced due diligence review.",
                "requiresLEFTR": requires_leftr,
                "requiresSTR": False,
                "amount": amount_float,
                "currency": currency,
                "destinationCountry": country_upper
            }
        }

    return {
        "status": "success",
        "data": {
            "checkStatus": "passed" if not requires_leftr else "passed",
            "reason": "CLEARED",
            "message": "Transfer cleared for processing.",
            "requiresLEFTR": requires_leftr,
            "requiresSTR": False,
            "largeTransactionReport": requires_leftr,
            "amount": amount_float,
            "currency": currency,
            "destinationCountry": country_upper,
            "wireType": wire_type
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
