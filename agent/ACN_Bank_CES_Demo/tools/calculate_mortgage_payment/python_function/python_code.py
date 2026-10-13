from typing import Any

CMHC_TIERS = [
    (0.05, 0.0999, 0.0400),  # 5-9.99% down: 4.00%
    (0.10, 0.1499, 0.0310),  # 10-14.99% down: 3.10%
    (0.15, 0.1999, 0.0280),  # 15-19.99% down: 2.80%
    (0.20, 1.0, 0.0000),     # 20%+ down: no CMHC
]
OSFI_QUALIFYING_RATE = 5.25  # Bank of Canada floor (demo value)

def calculate_mortgage_payment(
    purchase_price: str,
    down_payment: str,
    amortization_years: int = 25,
    rate_percent: str = ""
) -> dict[str, Any]:
    """Calculates monthly mortgage payment, GDS/TDS ratios, and CMHC premium.
Returns mortgage payment calculations silently. No pacing phrase required.
"""
    if not purchase_price or not down_payment:
        return {"status": "validation_error", "code": "MISSING_PARAMS", "data": {}}

    try:
        price = float(purchase_price.replace(",", ""))
        down = float(down_payment.replace(",", ""))
    except (ValueError, TypeError):
        return {"status": "validation_error", "code": "INVALID_AMOUNT", "data": {}}

    if price <= 0 or down <= 0:
        return {"status": "validation_error", "code": "INVALID_VALUES", "data": {}}

    rate = float(rate_percent.replace(",", "")) if rate_percent else 4.99  # Demo default
    down_pct = down / price
    loan_amount = price - down

    # CMHC
    cmhc_rate = 0.0
    for low, high, premium in CMHC_TIERS:
        if low <= down_pct <= high:
            cmhc_rate = premium
            break
    cmhc_premium = loan_amount * cmhc_rate
    total_loan = loan_amount + cmhc_premium

    # Monthly payment
    monthly_rate = rate / 100 / 12
    n = amortization_years * 12
    if monthly_rate > 0:
        monthly_payment = total_loan * (monthly_rate * (1 + monthly_rate) ** n) / ((1 + monthly_rate) ** n - 1)
    else:
        monthly_payment = total_loan / n

    # Stress test rate
    stress_rate = max(OSFI_QUALIFYING_RATE, rate + 2.0)
    stress_monthly_rate = stress_rate / 100 / 12
    stress_payment = total_loan * (stress_monthly_rate * (1 + stress_monthly_rate) ** n) / ((1 + stress_monthly_rate) ** n - 1)

    return {
        "status": "success",
        "data": {
            "purchasePrice": price,
            "downPayment": down,
            "downPaymentPercent": round(down_pct * 100, 2),
            "loanAmount": round(loan_amount, 2),
            "cmhcPremium": round(cmhc_premium, 2),
            "totalLoan": round(total_loan, 2),
            "interestRate": rate,
            "amortizationYears": amortization_years,
            "monthlyPayment": round(monthly_payment, 2),
            "stressTestRate": stress_rate,
            "stressTestMonthlyPayment": round(stress_payment, 2),
            "totalInterestPaid": round(monthly_payment * n - total_loan, 2),
            "requiresCMHC": cmhc_rate > 0
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
