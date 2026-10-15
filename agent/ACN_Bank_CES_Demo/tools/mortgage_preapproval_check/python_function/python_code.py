"""Canadian-style mortgage pre-approval maths for the demo.

Not a real underwriting model. Bureau data, appraisals and actual approval are
out of scope. What IS modelled properly, because a customer can check it
against any public Canadian calculator:

  - Fixed rates compound SEMI-ANNUALLY, not monthly. The earlier version of
    this tool compounded monthly, which overstated the payment.
  - Debt service is tested at the QUALIFYING rate — the greater of the contract
    rate plus 2% and 5.25%. Qualifying at the contract rate is the single
    biggest reason a naive estimate disagrees with a lender.
  - Below 20% down the CMHC premium is added to the principal, so the payment
    the customer is tested on is larger than the one they expected.
  - The minimum down payment is tiered: 5% of the first $500k, 10% to the
    $1.5M insured ceiling, 20% above it.

Kept deliberately in step with mortgage_payment_estimate and
mortgage_affordability_estimate — all three share the same constants and the
same formulas, so the three never contradict one another.

Before calling this tool, speak a brief conversational pacing phrase:
'Let me run those numbers for you.' Composite V1 runs the call synchronously, so without a
spoken bridge the caller hears dead air while the maths completes.
"""

from typing import Any, Dict, List, Tuple

ILLUSTRATIVE_RATE_PCT = 4.09
DEFAULT_AMORTIZATION_YEARS = 25
MAX_LTV_PCT = 95.0
GDS_TARGET_PCT = 39.0
TDS_TARGET_PCT = 44.0

STRESS_TEST_FLOOR_PCT = 5.25
STRESS_TEST_MARGIN_PCT = 2.0

INSURED_PRICE_CEILING_CAD = 1_500_000.0
CONVENTIONAL_DOWN_PCT = 20.0
RATE_HOLD_DAYS = 120

CMHC_PREMIUM_BANDS: List[Tuple[float, float]] = [
    (65.0, 0.60),
    (75.0, 1.70),
    (80.0, 2.40),
    (85.0, 2.80),
    (90.0, 3.10),
    (95.0, 4.00),
]
CMHC_LONG_AMORTIZATION_SURCHARGE_PCT = 0.20

# Ongoing housing costs we assume rather than ask for. These MUST stay
# identical to mortgage_affordability_estimate and mortgage_payment_estimate:
# if they drift, the affordability tool will quote a maximum price that this
# tool then declines, which is exactly the contradiction the customer notices.
ASSUMED_PROPERTY_TAX_MONTHLY_PCT = 0.085
ASSUMED_HEAT_MONTHLY_CAD = 150.0
ASSUMED_CONDO_FEE_MONTHLY_PCT = 0.055


# T001 - error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}

def mortgage_preapproval_check(
    property_price_cad: float,
    down_payment_cad: float,
    tenure_years: float = DEFAULT_AMORTIZATION_YEARS,
    interest_rate_pct: float = ILLUSTRATIVE_RATE_PCT,
    gross_annual_income_cad: float = 0,
    monthly_debt_obligations_cad: float = 0,
    employment_status: str = "",
    years_employed: float = 0,
    province: str = "",
    rate_type: str = "fixed",
    payment_frequency: str = "monthly",
    first_time_buyer: bool = False,
    property_type: str = "Detached",
) -> Dict[str, Any]:
    try:
        price = float(property_price_cad or 0)
        down = float(down_payment_cad or 0)
        years = float(tenure_years or DEFAULT_AMORTIZATION_YEARS)
        rate = float(interest_rate_pct or ILLUSTRATIVE_RATE_PCT)
        annual_income = float(gross_annual_income_cad or 0)
        monthly_debts = float(monthly_debt_obligations_cad or 0)
        yrs_emp = float(years_employed or 0)
    except (TypeError, ValueError):
        return {"status": "error", "message": "Numeric inputs required."}

    if price <= 0 or annual_income <= 0:
        return {"status": "error", "message": "Property price and income are required."}

    base_principal = max(price - down, 0.0)
    ltv_pct = round((base_principal / price) * 100, 1) if price else 0.0
    down_pct = round((down / price) * 100, 2) if price else 0.0

    reasons: List[str] = []

    # ── Down payment rule (Canadian standard, tiered). ────────────────────
    min_down = _minimum_down_payment_cad(price)
    if down < min_down:
        reasons.append(
            "Down payment is below the minimum for a property at this price."
        )

    if ltv_pct > MAX_LTV_PCT:
        reasons.append("Loan-to-value ratio exceeds the maximum we can support.")

    # ── Default insurance, which gets added to the principal. ─────────────
    insured = False
    premium_pct = 0.0
    premium_cad = 0.0
    if down_pct < CONVENTIONAL_DOWN_PCT and base_principal > 0:
        if price > INSURED_PRICE_CEILING_CAD:
            reasons.append(
                "Above the insured price ceiling, so 20% down is required."
            )
        elif years > DEFAULT_AMORTIZATION_YEARS and not first_time_buyer:
            reasons.append(
                "A 30-year insured amortization is limited to first-time buyers"
                " and newly built homes."
            )
        elif ltv_pct <= MAX_LTV_PCT:
            insured = True
            premium_pct = _premium_pct_for_ltv(ltv_pct)
            if years > DEFAULT_AMORTIZATION_YEARS:
                premium_pct = round(premium_pct + CMHC_LONG_AMORTIZATION_SURCHARGE_PCT, 2)
            premium_cad = round(base_principal * premium_pct / 100.0, 2)

    total_mortgage = round(base_principal + premium_cad, 2)

    # ── Payments: one at the contract rate, one at the qualifying rate. ───
    compounding = 2 if (rate_type or "fixed").lower() == "fixed" else 12
    qualifying_rate = round(max(rate + STRESS_TEST_MARGIN_PCT, STRESS_TEST_FLOOR_PCT), 2)

    monthly_payment = _amortized_monthly_payment(total_mortgage, rate, years, compounding)
    qualifying_payment = _amortized_monthly_payment(total_mortgage, qualifying_rate, years, 2)

    monthly_other_housing = _other_housing_monthly_cad(price, property_type)
    monthly_income = annual_income / 12.0

    # Debt service is tested on the QUALIFYING payment, not the contract one.
    gds_pct = _ratio_pct(qualifying_payment + monthly_other_housing, monthly_income)
    tds_pct = _ratio_pct(
        qualifying_payment + monthly_other_housing + monthly_debts,
        monthly_income,
    )

    if gds_pct > GDS_TARGET_PCT:
        reasons.append(
            "Housing costs at the qualifying rate would take too large a share"
            " of your monthly income."
        )
    if tds_pct > TDS_TARGET_PCT:
        reasons.append(
            "Total monthly debt including this mortgage would be higher than we"
            " can approve today."
        )

    if employment_status and employment_status.lower() in {"unemployed", "student"}:
        reasons.append("Employment status makes a pre-approval today difficult.")
    if yrs_emp and yrs_emp < 1:
        reasons.append("Under one year with your current employer, so final approval will need more review.")

    # ── Verdict. ───────────────────────────────────────────────────────────
    hard_fails = any(
        r.startswith(("Down payment", "Loan-to-value", "Above the insured")) for r in reasons
    )
    if hard_fails:
        verdict = "not_eligible"
    elif reasons:
        verdict = "needs_review"
    else:
        verdict = "pre_approved"

    max_affordable_loan = _max_affordable_loan(
        monthly_income, monthly_debts, monthly_other_housing, qualifying_rate, years
    )

    return {
        "status": "success",
        "verdict": verdict,
        "monthly_payment_cad": monthly_payment,
        "loan_principal_cad": round(base_principal, 2),
        "total_mortgage_cad": total_mortgage,
        "loan_to_value_pct": ltv_pct,
        "down_payment_pct": down_pct,
        "minimum_down_payment_cad": min_down,
        "insured": insured,
        "cmhc_premium_pct": premium_pct,
        "cmhc_premium_cad": premium_cad,
        "gds_pct": gds_pct,
        "tds_pct": tds_pct,
        "gds_target_pct": GDS_TARGET_PCT,
        "tds_target_pct": TDS_TARGET_PCT,
        "qualifying_rate_pct": qualifying_rate,
        "qualifying_payment_cad": qualifying_payment,
        "stress_test_gap_cad": round(qualifying_payment - monthly_payment, 2),
        "max_affordable_loan_cad": max_affordable_loan,
        "recommended_monthly_cad": monthly_payment,
        "reasons": reasons,
        "is_provisional": True,
        "interest_rate_pct": rate,
        "rate_type": (rate_type or "fixed").lower(),
        "payment_frequency": payment_frequency or "monthly",
        "tenure_years": years,
        "rate_hold_days": RATE_HOLD_DAYS,
    }


def _other_housing_monthly_cad(price: float, property_type: str) -> float:
    """Property tax + heat + half of any condo fees, the way a lender counts it.

    Only half of condo fees go into debt service. Maintenance is deliberately
    excluded here: it is a real cost of ownership but lenders do not put it in
    GDS, and including it would make this tool decline prices that
    mortgage_affordability_estimate had just called affordable.
    """
    total = price * ASSUMED_PROPERTY_TAX_MONTHLY_PCT / 100.0 + ASSUMED_HEAT_MONTHLY_CAD
    if "condo" in (property_type or "").lower():
        total += (price * ASSUMED_CONDO_FEE_MONTHLY_PCT / 100.0) * 0.5
    return round(total, 2)


def _minimum_down_payment_cad(price: float) -> float:
    if price > INSURED_PRICE_CEILING_CAD:
        return round(price * 0.20, 2)
    if price <= 500_000:
        return round(price * 0.05, 2)
    return round(500_000 * 0.05 + (price - 500_000) * 0.10, 2)


def _premium_pct_for_ltv(ltv_pct: float) -> float:
    for ceiling, pct in CMHC_PREMIUM_BANDS:
        if ltv_pct <= ceiling:
            return pct
    return CMHC_PREMIUM_BANDS[-1][1]


def _periodic_rate(annual_rate_pct: float, periods_per_year: int, compounding_per_year: int) -> float:
    """Convert a nominal Canadian quoted rate into a true per-period rate."""
    nominal = annual_rate_pct / 100.0
    if nominal <= 0:
        return 0.0
    effective_annual = (1.0 + nominal / compounding_per_year) ** compounding_per_year - 1.0
    return (1.0 + effective_annual) ** (1.0 / periods_per_year) - 1.0


def _amortized_monthly_payment(
    principal: float, annual_rate_pct: float, years: float, compounding: int = 2
) -> float:
    if principal <= 0 or years <= 0:
        return 0.0
    n = int(round(years * 12))
    r = _periodic_rate(annual_rate_pct, 12, compounding)
    if r == 0:
        return round(principal / n, 2)
    return round(principal * (r / (1.0 - (1.0 + r) ** (-n))), 2)


def _ratio_pct(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100.0, 1)


def _max_affordable_loan(
    monthly_income: float,
    monthly_debts: float,
    monthly_other_housing: float,
    qualifying_rate_pct: float,
    years: float,
) -> float:
    """Reverse the PMT formula at the qualifying rate: largest principal whose
    debt service lands on the tighter of the GDS and TDS targets."""
    gds_budget = (monthly_income * GDS_TARGET_PCT / 100.0) - monthly_other_housing
    tds_budget = (monthly_income * TDS_TARGET_PCT / 100.0) - monthly_debts - monthly_other_housing
    monthly_budget = min(max(gds_budget, 0.0), max(tds_budget, 0.0))

    if monthly_budget <= 0 or years <= 0:
        return 0.0
    n = int(round(years * 12))
    r = _periodic_rate(qualifying_rate_pct, 12, 2)
    if r == 0:
        return round(monthly_budget * n, 2)
    return round(monthly_budget * (1.0 - (1.0 + r) ** (-n)) / r, 2)
