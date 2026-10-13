from typing import Any

EPP_APR = 0.1999  # 19.99% standard EPP APR (demo)

def calculate_epp_plans(purchase_amount: str, tenures: str = "6,12,24") -> dict[str, Any]:
    """Computes EPP monthly payment, APR, and total cost for each tenure.
Returns EPP plan options silently. No pacing phrase required.
"""
    if not purchase_amount:
        return {"status": "validation_error", "code": "MISSING_AMOUNT", "data": {}}

    try:
        principal = float(purchase_amount.replace(",", ""))
    except (ValueError, TypeError):
        return {"status": "validation_error", "code": "INVALID_AMOUNT", "data": {}}

    if principal <= 0:
        return {"status": "validation_error", "code": "AMOUNT_TOO_LOW", "data": {}}

    try:
        tenure_list = [int(t.strip()) for t in tenures.split(",") if t.strip()]
    except (ValueError, TypeError):
        tenure_list = [6, 12, 24]

    plans = []
    monthly_rate = EPP_APR / 12

    for months in tenure_list:
        if months <= 0:
            continue
        if monthly_rate > 0:
            payment = principal * (monthly_rate * (1 + monthly_rate) ** months) / ((1 + monthly_rate) ** months - 1)
        else:
            payment = principal / months
        total = payment * months
        interest_total = total - principal

        plans.append({
            "tenureMonths": months,
            "monthlyPayment": round(payment, 2),
            "totalCost": round(total, 2),
            "totalInterest": round(interest_total, 2),
            "apr": round(EPP_APR * 100, 2),
            "label": f"{months}-month plan"
        })

    return {
        "status": "success",
        "data": {
            "purchaseAmount": principal,
            "currency": "CAD",
            "plans": plans,
            "minimumPurchase": 100.00,
            "eligible": principal >= 100.00
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
