from typing import Any

GDS_RATIO = 0.32
TDS_RATIO = 0.44
OSFI_QUALIFYING_RATE = 5.25
PROPERTY_TAX_MONTHLY_ESTIMATE = 400.0
CONDO_FEE_ESTIMATE = 0.0

def calculate_affordability(annual_income: str, down_payment: str, monthly_debts: str = "0") -> dict[str, Any]:
    """Calculates maximum purchase price using GDS/TDS ratios and OSFI stress test.
Returns affordability calculations silently. No pacing phrase required.
"""
    if not annual_income or not down_payment:
        return {"status": "validation_error", "code": "MISSING_PARAMS", "data": {}}

    try:
        income = float(annual_income.replace(",", ""))
        down = float(down_payment.replace(",", ""))
        debts = float((monthly_debts or "0").replace(",", ""))
    except (ValueError, TypeError):
        return {"status": "validation_error", "code": "INVALID_AMOUNT", "data": {}}

    monthly_income = income / 12
    stress_monthly_rate = OSFI_QUALIFYING_RATE / 100 / 12
    n = 25 * 12  # 25-year amortization

    # GDS: (mortgage + property tax + condo fee) / monthly income <= 32%
    max_housing_gds = monthly_income * GDS_RATIO - PROPERTY_TAX_MONTHLY_ESTIMATE - CONDO_FEE_ESTIMATE
    # TDS: (mortgage + all debts + property tax + condo fee) / monthly income <= 44%
    max_housing_tds = monthly_income * TDS_RATIO - debts - PROPERTY_TAX_MONTHLY_ESTIMATE - CONDO_FEE_ESTIMATE

    max_mortgage_payment = min(max_housing_gds, max_housing_tds)
    max_mortgage_payment = max(max_mortgage_payment, 0)

    # Back-calculate loan from max payment
    if stress_monthly_rate > 0 and max_mortgage_payment > 0:
        max_loan = max_mortgage_payment * ((1 + stress_monthly_rate) ** n - 1) / (stress_monthly_rate * (1 + stress_monthly_rate) ** n)
    else:
        max_loan = 0

    max_purchase = max_loan + down

    return {
        "status": "success",
        "data": {
            "annualIncome": income,
            "downPayment": down,
            "monthlyDebts": debts,
            "maxPurchasePrice": round(max_purchase, 0),
            "maxMortgage": round(max_loan, 0),
            "maxMonthlyPayment": round(max_mortgage_payment, 2),
            "gdsRatioUsed": GDS_RATIO * 100,
            "tdsRatioUsed": TDS_RATIO * 100,
            "stressTestRate": OSFI_QUALIFYING_RATE,
            "assumptions": {
                "propertyTaxMonthly": PROPERTY_TAX_MONTHLY_ESTIMATE,
                "amortizationYears": 25
            }
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
