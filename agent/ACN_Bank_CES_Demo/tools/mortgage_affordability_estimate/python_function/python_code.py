"""Canadian mortgage affordability maths for the demo — the income-side engine.

This is the "what can I afford" direction, the mirror of
mortgage_payment_estimate: the customer brings an income, a down payment and
their existing debts, and we return the highest purchase price that still
clears the debt-service caps.

How the number is actually produced:

  - We bisect on purchase price. A price is affordable only if all three hold:
    the down payment meets the tiered legal minimum, GDS is within cap, and
    TDS is within cap.
  - Debt service is tested at the QUALIFYING rate — the greater of the contract
    rate plus 2% and 5.25%. This is the Canadian stress test, and it is the
    single biggest reason a customer's own arithmetic disagrees with a lender's.
    We return both the qualifying payment (what they were tested on) and the
    contract payment (what they would actually pay).
  - Caps are CMHC's 39% GDS / 44% TDS, matching mortgage_preapproval_check so
    the two tools never contradict each other.
  - Below 20% down the CMHC premium is added to the loan, which pushes the
    payment up and the affordable price down. Customers never expect this.

Bureau data, appraisals and actual approval are out of scope.
"""

from typing import Any, Dict, List, Optional, Tuple

# ── Caps and rules. Kept in step with mortgage_payment_estimate. ────────────

GDS_CAP_PCT = 39.0
TDS_CAP_PCT = 44.0
STRESS_TEST_FLOOR_PCT = 5.25
STRESS_TEST_MARGIN_PCT = 2.0

INSURED_PRICE_CEILING_CAD = 1_500_000.0
CONVENTIONAL_DOWN_PCT = 20.0
STANDARD_AMORTIZATION_YEARS = 25.0
MAX_INSURED_LTV_PCT = 95.0

CMHC_PREMIUM_BANDS: List[Tuple[float, float]] = [
    (65.0, 0.60),
    (75.0, 1.70),
    (80.0, 2.40),
    (85.0, 2.80),
    (90.0, 3.10),
    (95.0, 4.00),
]
CMHC_LONG_AMORTIZATION_SURCHARGE_PCT = 0.20

ASSUMED_PROPERTY_TAX_MONTHLY_PCT = 0.085
ASSUMED_MAINTENANCE_MONTHLY_PCT = 0.050
ASSUMED_HEAT_MONTHLY_CAD = 150.0
ASSUMED_CONDO_FEE_MONTHLY_PCT = 0.055

# First-home savings vehicles, used for the down-payment booster.
FHSA_ANNUAL_LIMIT_CAD = 8_000.0
FHSA_LIFETIME_LIMIT_CAD = 40_000.0
HBP_WITHDRAWAL_LIMIT_CAD = 60_000.0

_SEARCH_CEILING_CAD = 5_000_000.0


def mortgage_affordability_estimate(
    gross_annual_income_cad: float,
    down_payment_cad: float,
    monthly_debt_obligations_cad: float = 0,
    interest_rate_pct: float = 4.09,
    amortization_years: float = STANDARD_AMORTIZATION_YEARS,
    property_type: str = "Detached",
    province: str = "ON",
    first_time_buyer: bool = False,
    newly_built: bool = False,
) -> Dict[str, Any]:
    """Highest purchase price that clears GDS, TDS and the minimum down payment."""
    try:
        annual_income = float(gross_annual_income_cad or 0)
        down = float(down_payment_cad or 0)
        monthly_debts = float(monthly_debt_obligations_cad or 0)
        rate = float(interest_rate_pct or 0)
        years = float(amortization_years or STANDARD_AMORTIZATION_YEARS)
    except (TypeError, ValueError):
        return {"status": "error", "message": "Numeric inputs required."}

    if annual_income <= 0:
        return {"status": "error", "message": "Gross annual income is required."}
    if down <= 0:
        return {"status": "error", "message": "A down payment amount is required."}
    if rate <= 0:
        return {"status": "error", "message": "An interest rate is required."}

    monthly_income = annual_income / 12.0
    qualifying_rate = round(max(rate + STRESS_TEST_MARGIN_PCT, STRESS_TEST_FLOOR_PCT), 2)
    is_condo = "condo" in (property_type or "").lower()

    price = _max_price(
        monthly_income, monthly_debts, down, qualifying_rate, years,
        is_condo, bool(first_time_buyer), bool(newly_built),
    )

    if price <= 0:
        # Nothing clears the caps. Say what would have to change.
        return {
            "status": "success",
            "affordable": False,
            "max_purchase_price_cad": 0.0,
            "qualifying_rate_pct": qualifying_rate,
            "contract_rate_pct": rate,
            "gds_cap_pct": GDS_CAP_PCT,
            "tds_cap_pct": TDS_CAP_PCT,
            "gross_monthly_income_cad": round(monthly_income, 2),
            "monthly_debt_obligations_cad": round(monthly_debts, 2),
            "binding_constraint": "tds" if monthly_debts > 0 else "gds",
            "reasons": [
                "At this income and these existing debts we could not clear the"
                " debt-service caps at the qualifying rate."
            ],
            "fhsa_hbp_boost": _fhsa_hbp_boost(
                0.0, monthly_income, monthly_debts, down, qualifying_rate, years,
                is_condo, bool(first_time_buyer), bool(newly_built),
            ),
            "is_provisional": True,
        }

    detail = _evaluate(
        price, monthly_income, monthly_debts, down, qualifying_rate, years,
        is_condo, bool(first_time_buyer), bool(newly_built),
    )

    # Re-derive the payment they would actually make, at the contract rate.
    contract_compounding = 2
    contract_monthly_rate = _periodic_rate(rate, 12, contract_compounding)
    contract_payment = _payment_for(detail["total_mortgage_cad"], contract_monthly_rate, int(round(years * 12)))

    down_for_20 = round(price * CONVENTIONAL_DOWN_PCT / 100.0, 2)

    return {
        "status": "success",
        "affordable": True,
        "max_purchase_price_cad": price,
        "max_mortgage_cad": detail["total_mortgage_cad"],
        "loan_principal_cad": detail["base_loan_cad"],
        "down_payment_cad": round(down, 2),
        "down_payment_pct": detail["down_payment_pct"],
        "minimum_down_payment_cad": detail["minimum_down_payment_cad"],
        "loan_to_value_pct": detail["loan_to_value_pct"],
        "insured": detail["insured"],
        "cmhc_premium_pct": detail["cmhc_premium_pct"],
        "cmhc_premium_cad": detail["cmhc_premium_cad"],
        "gds_pct": detail["gds_pct"],
        "tds_pct": detail["tds_pct"],
        "gds_cap_pct": GDS_CAP_PCT,
        "tds_cap_pct": TDS_CAP_PCT,
        "binding_constraint": detail["binding_constraint"],
        "qualifying_rate_pct": qualifying_rate,
        "qualifying_payment_cad": detail["qualifying_payment_cad"],
        "contract_rate_pct": rate,
        "contract_payment_cad": round(contract_payment, 2),
        "stress_test_gap_cad": round(detail["qualifying_payment_cad"] - contract_payment, 2),
        "amortization_years": years,
        "gross_monthly_income_cad": round(monthly_income, 2),
        "monthly_debt_obligations_cad": round(monthly_debts, 2),
        "housing_cost_breakdown": detail["housing"],
        "total_monthly_housing_cost_cad": round(
            contract_payment + sum(detail["housing"].values()), 2
        ),
        "down_payment_for_20_pct_cad": down_for_20,
        "down_payment_gap_to_20_pct_cad": round(max(down_for_20 - down, 0.0), 2),
        "premium_avoided_at_20_pct_cad": detail["cmhc_premium_cad"],
        "fhsa_hbp_boost": _fhsa_hbp_boost(
            price, monthly_income, monthly_debts, down, qualifying_rate, years,
            is_condo, bool(first_time_buyer), bool(newly_built),
        ),
        "province": (province or "ON").strip().upper()[:2],
        "property_type": property_type or "Detached",
        "first_time_buyer": bool(first_time_buyer),
        "is_provisional": True,
    }


# ── The search. ─────────────────────────────────────────────────────────────

def _max_price(
    monthly_income: float, monthly_debts: float, down: float, qualifying_rate: float,
    years: float, is_condo: bool, first_time_buyer: bool, newly_built: bool,
) -> float:
    """Bisect on price. Affordability is monotone decreasing in price: raising
    the price raises both the payment and the legal minimum down payment."""
    low = 0.0
    high = min(_SEARCH_CEILING_CAD, down * 25.0 + 100_000.0)

    if not _is_affordable(low + 1000.0, monthly_income, monthly_debts, down, qualifying_rate,
                          years, is_condo, first_time_buyer, newly_built):
        return 0.0

    # Push the ceiling out until it genuinely fails, so we never clip the answer.
    while _is_affordable(high, monthly_income, monthly_debts, down, qualifying_rate,
                         years, is_condo, first_time_buyer, newly_built):
        high *= 2.0
        if high > _SEARCH_CEILING_CAD:
            return _SEARCH_CEILING_CAD

    for _ in range(60):
        mid = (low + high) / 2.0
        if _is_affordable(mid, monthly_income, monthly_debts, down, qualifying_rate,
                          years, is_condo, first_time_buyer, newly_built):
            low = mid
        else:
            high = mid
    # Round down to the nearest $1,000 — a price this precise is false comfort.
    return float(int(low / 1000.0) * 1000)


def _is_affordable(
    price: float, monthly_income: float, monthly_debts: float, down: float,
    qualifying_rate: float, years: float, is_condo: bool,
    first_time_buyer: bool, newly_built: bool,
) -> bool:
    if price <= 0:
        return False
    # Note: a price at or below the down payment needs no mortgage, but it must
    # still clear TDS — existing debts alone can put someone over the cap, and
    # short-circuiting here would hand them a meaningless "you can afford
    # exactly your savings" answer.
    detail = _evaluate(price, monthly_income, monthly_debts, down, qualifying_rate,
                       years, is_condo, first_time_buyer, newly_built)
    if detail is None:
        return False
    return (
        detail["meets_minimum_down"]
        and detail["insurable_or_conventional"]
        and detail["gds_pct"] <= GDS_CAP_PCT
        and detail["tds_pct"] <= TDS_CAP_PCT
    )


def _evaluate(
    price: float, monthly_income: float, monthly_debts: float, down: float,
    qualifying_rate: float, years: float, is_condo: bool,
    first_time_buyer: bool, newly_built: bool,
) -> Optional[Dict[str, Any]]:
    """Everything we need to know about one candidate price."""
    if price <= 0:
        return None

    min_down = _minimum_down_payment_cad(price)
    down_pct = round((down / price) * 100.0, 2)
    base_loan = max(price - down, 0.0)
    base_ltv = round((base_loan / price) * 100.0, 2)

    insured = down_pct < CONVENTIONAL_DOWN_PCT
    insurable_or_conventional = True
    premium_pct = 0.0
    premium_cad = 0.0

    if insured:
        if price > INSURED_PRICE_CEILING_CAD or base_ltv > MAX_INSURED_LTV_PCT:
            insurable_or_conventional = False
        elif years > STANDARD_AMORTIZATION_YEARS and not (first_time_buyer or newly_built):
            insurable_or_conventional = False
        else:
            premium_pct = _premium_pct_for_ltv(base_ltv)
            if years > STANDARD_AMORTIZATION_YEARS:
                premium_pct = round(premium_pct + CMHC_LONG_AMORTIZATION_SURCHARGE_PCT, 2)
            premium_cad = round(base_loan * premium_pct / 100.0, 2)

    total_mortgage = round(base_loan + premium_cad, 2)

    # Tested at the qualifying rate, on a monthly schedule.
    qualifying_monthly_rate = _periodic_rate(qualifying_rate, 12, 2)
    qualifying_payment = _payment_for(total_mortgage, qualifying_monthly_rate, int(round(years * 12)))

    housing = {
        "property_tax_monthly_cad": round(price * ASSUMED_PROPERTY_TAX_MONTHLY_PCT / 100.0, 2),
        "heat_monthly_cad": ASSUMED_HEAT_MONTHLY_CAD,
        "maintenance_monthly_cad": round(price * ASSUMED_MAINTENANCE_MONTHLY_PCT / 100.0, 2),
        "condo_fee_monthly_cad": round(price * ASSUMED_CONDO_FEE_MONTHLY_PCT / 100.0, 2) if is_condo else 0.0,
    }
    # Lenders count only half of condo fees toward debt service.
    gds_costs = (
        qualifying_payment
        + housing["property_tax_monthly_cad"]
        + housing["heat_monthly_cad"]
        + housing["condo_fee_monthly_cad"] * 0.5
    )
    gds_pct = _ratio_pct(gds_costs, monthly_income)
    tds_pct = _ratio_pct(gds_costs + monthly_debts, monthly_income)

    if not down >= min_down:
        binding = "down_payment"
    elif tds_pct >= gds_pct * (TDS_CAP_PCT / GDS_CAP_PCT):
        binding = "tds"
    else:
        binding = "gds"

    return {
        "base_loan_cad": round(base_loan, 2),
        "total_mortgage_cad": total_mortgage,
        "down_payment_pct": down_pct,
        "minimum_down_payment_cad": min_down,
        "meets_minimum_down": down >= min_down,
        "insurable_or_conventional": insurable_or_conventional,
        "loan_to_value_pct": base_ltv,
        "insured": insured and insurable_or_conventional,
        "cmhc_premium_pct": premium_pct,
        "cmhc_premium_cad": premium_cad,
        "qualifying_payment_cad": round(qualifying_payment, 2),
        "gds_pct": gds_pct,
        "tds_pct": tds_pct,
        "binding_constraint": binding,
        "housing": housing,
    }


# ── The FHSA / HBP down-payment booster. ────────────────────────────────────

def _fhsa_hbp_boost(
    current_price: float, monthly_income: float, monthly_debts: float, down: float,
    qualifying_rate: float, years: float, is_condo: bool,
    first_time_buyer: bool, newly_built: bool,
) -> Dict[str, Any]:
    """What the first-home savings vehicles would add to the affordable price.

    Only offered to first-time buyers, because that is who is eligible.
    """
    if not first_time_buyer:
        return {
            "eligible": False,
            "note": "The FHSA and the Home Buyers' Plan are for first-time buyers.",
        }

    extra = FHSA_LIFETIME_LIMIT_CAD + HBP_WITHDRAWAL_LIMIT_CAD
    boosted_price = _max_price(
        monthly_income, monthly_debts, down + extra, qualifying_rate, years,
        is_condo, first_time_buyer, newly_built,
    )
    return {
        "eligible": True,
        "fhsa_annual_limit_cad": FHSA_ANNUAL_LIMIT_CAD,
        "fhsa_lifetime_limit_cad": FHSA_LIFETIME_LIMIT_CAD,
        "hbp_withdrawal_limit_cad": HBP_WITHDRAWAL_LIMIT_CAD,
        "potential_extra_down_cad": extra,
        "boosted_down_payment_cad": round(down + extra, 2),
        "boosted_max_purchase_price_cad": boosted_price,
        "price_uplift_cad": round(max(boosted_price - current_price, 0.0), 2),
        "assumes": (
            "Assumes both limits are fully available. The FHSA fills at"
            " 8,000 a year, and the Home Buyers' Plan must be repaid."
        ),
    }


# ── Shared maths. Duplicated per tool by convention: CES python tools are ───
# ── standalone files and cannot import one another. ─────────────────────────

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
    nominal = annual_rate_pct / 100.0
    if nominal <= 0:
        return 0.0
    effective_annual = (1.0 + nominal / compounding_per_year) ** compounding_per_year - 1.0
    return (1.0 + effective_annual) ** (1.0 / periods_per_year) - 1.0


def _payment_for(principal: float, periodic_rate: float, periods: int) -> float:
    if principal <= 0 or periods <= 0:
        return 0.0
    if periodic_rate <= 0:
        return principal / periods
    factor = periodic_rate / (1.0 - (1.0 + periodic_rate) ** (-periods))
    return principal * factor


def _ratio_pct(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100.0, 1)
