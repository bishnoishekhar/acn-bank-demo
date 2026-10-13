"""
P17 — evaluate_credit_policy
Credit decision engine for card, mortgage, and loan applications.
Returns decision, credit limit, rate, reason codes, adverse action flag.
Before calling this tool, speak a brief pacing phrase: 'Reviewing your application now — this will take just a moment.'
"""


def evaluate_credit_policy(
    customer_id: str,
    application_id: str,
    product_type: str,
    requested_amount: float = 0.0,
) -> dict:
    """
    Run credit policy evaluation for the given application.

    Args:
        customer_id: Firestore customer document ID.
        application_id: Application document ID to update with decision.
        product_type: Product type: 'credit_card' | 'mortgage' | 'personal_loan' |
                      'line_of_credit' | 'epp'.
        requested_amount: Requested credit limit or loan amount in CAD.

    Returns:
        {decision('approved'|'declined'|'referred'), credit_limit, interest_rate,
         reason_codes(list), adverse_action_required(bool)}
    """
    mock_mode = get_variable("mock_mode", "false")

    if mock_mode == "true":
        # Mock: approve most applications; decline if requested_amount > 50000
        if requested_amount > 50000:
            return {
                "status": "success",
                "decision": "declined",
                "credit_limit": 0.0,
                "interest_rate": 0.0,
                "reason_codes": ["EXCEEDS_MAX_LIMIT", "DEBT_RATIO_HIGH"],
                "adverse_action_required": True,
            }
        if requested_amount > 25000:
            return {
                "status": "success",
                "decision": "referred",
                "credit_limit": requested_amount * 0.6,
                "interest_rate": 12.99,
                "reason_codes": ["MANUAL_REVIEW_REQUIRED"],
                "adverse_action_required": False,
            }
        return {
            "status": "success",
            "decision": "approved",
            "credit_limit": max(requested_amount, 5000.0),
            "interest_rate": 19.99 if product_type == "credit_card" else 7.49,
            "reason_codes": [],
            "adverse_action_required": False,
        }

    # Production stub
    return {
        "status": "success",
        "decision": "referred",
        "credit_limit": 0.0,
        "interest_rate": 0.0,
        "reason_codes": ["SYSTEM_UNAVAILABLE"],
        "adverse_action_required": False,
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
