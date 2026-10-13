"""
P18 — calculate_loan_payment
Calculate monthly payment and total cost for a personal loan.
No auth required — purely computational.
Before calling this tool, speak a brief pacing phrase: 'Calculating your loan details now.'
"""
import math


def calculate_loan_payment(
    principal: float,
    annual_rate: float,
    term_months: int,
) -> dict:
    """
    Amortization calculation for a personal loan.

    Args:
        principal: Loan principal in CAD.
        annual_rate: Annual interest rate as a percentage (e.g., 7.5 for 7.5%).
        term_months: Loan term in months.

    Returns:
        {monthly_payment, total_interest, total_cost, amortization_schedule_url}
    """
    if principal <= 0 or term_months <= 0:
        return {
            "status": "validation_error",
            "error": "Principal and term must be positive.",
        }

    if annual_rate <= 0:
        # Zero-interest loan
        monthly_payment = round(principal / term_months, 2)
        return {
            "status": "success",
            "monthly_payment": monthly_payment,
            "total_interest": 0.0,
            "total_cost": round(principal, 2),
            "amortization_schedule_url": f"https://acnbank.ca/loans/schedule?p={principal}&r=0&t={term_months}",
        }

    monthly_rate = annual_rate / 100 / 12
    monthly_payment = round(
        principal * monthly_rate * math.pow(1 + monthly_rate, term_months)
        / (math.pow(1 + monthly_rate, term_months) - 1),
        2,
    )
    total_cost = round(monthly_payment * term_months, 2)
    total_interest = round(total_cost - principal, 2)

    return {
        "status": "success",
        "monthly_payment": monthly_payment,
        "total_interest": total_interest,
        "total_cost": total_cost,
        "amortization_schedule_url": (
            f"https://acnbank.ca/loans/schedule"
            f"?p={principal}&r={annual_rate}&t={term_months}"
        ),
    }

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
