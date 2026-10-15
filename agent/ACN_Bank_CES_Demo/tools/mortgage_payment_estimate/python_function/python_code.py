"""Canadian mortgage payment maths for the demo — the payment-side engine.

This is the "what would this home cost me" direction: the customer brings a
property price, we return the payment and everything that lands around it.

Not a real underwriting model, but the mechanics that customers can check
against any Canadian calculator are done properly:

  - Fixed rates compound SEMI-ANNUALLY, not monthly. This is the legal
    convention in Canada and the reason a naive monthly-compounded PMT
    overstates the payment by a few dollars a month. Variable rates and HELOCs
    compound monthly.
  - Minimum down payment is tiered (5% of the first $500k, 10% of the rest,
    20% above $1.5M), not a flat 5%.
  - CMHC default-insurance premium is a percentage of the LOAN by LTV band,
    added to the principal, with a surcharge past 25-year amortization.
  - Land transfer tax is province-specific, with first-time-buyer rebates.
  - Provincial sales tax on the CMHC premium is payable AT CLOSING in ON, QC,
    MB and SK — it cannot be rolled into the mortgage. Customers are regularly
    surprised by this, so we surface it.

Appraisals, bureau data and actual approval are out of scope.

Before calling this tool, speak a brief conversational pacing phrase:
'Let me work out what that payment would look like.' Composite V1 runs the call synchronously, so without a
spoken bridge the caller hears dead air while the maths completes.
"""

import math
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

# ── Rules of the road. Tunable for a demo; all Sept 2026 values. ────────────

INSURED_PRICE_CEILING_CAD = 1_500_000.0
CONVENTIONAL_DOWN_PCT = 20.0
STANDARD_AMORTIZATION_YEARS = 25.0

# Premium as a % of the loan, by loan-to-value. Only applies below 20% down.
CMHC_PREMIUM_BANDS: List[Tuple[float, float]] = [
    (65.0, 0.60),
    (75.0, 1.70),
    (80.0, 2.40),
    (85.0, 2.80),
    (90.0, 3.10),
    (95.0, 4.00),
]
CMHC_LONG_AMORTIZATION_SURCHARGE_PCT = 0.20
MAX_INSURED_LTV_PCT = 95.0

# Payment frequency -> (payments per year, is_accelerated).
# An accelerated payment is simply the monthly payment cut in half (bi-weekly)
# or in four (weekly), which sneaks in one extra monthly payment a year.
FREQUENCIES: Dict[str, Tuple[int, bool]] = {
    "monthly": (12, False),
    "semi_monthly": (24, False),
    "bi_weekly": (26, False),
    "weekly": (52, False),
    "accelerated_bi_weekly": (26, True),
    "accelerated_weekly": (52, True),
}
FREQUENCY_LABELS: Dict[str, str] = {
    "monthly": "Monthly",
    "semi_monthly": "Semi-monthly",
    "bi_weekly": "Bi-weekly",
    "weekly": "Weekly",
    "accelerated_bi_weekly": "Accelerated bi-weekly",
    "accelerated_weekly": "Accelerated weekly",
}

# Ongoing housing costs we assume rather than ask for, as a % of price / month.
ASSUMED_PROPERTY_TAX_MONTHLY_PCT = 0.085
ASSUMED_MAINTENANCE_MONTHLY_PCT = 0.050
ASSUMED_HEAT_MONTHLY_CAD = 150.0
ASSUMED_CONDO_FEE_MONTHLY_PCT = 0.055  # of price, condos only

# One-off closing costs other than land transfer tax.
CLOSING_LEGAL_CAD = 1800.0
CLOSING_TITLE_INSURANCE_CAD = 350.0
CLOSING_APPRAISAL_CAD = 400.0
CLOSING_INSPECTION_CAD = 500.0

# Prepayment privileges.
ANNUAL_LUMP_SUM_PRIVILEGE_PCT = 15.0
PAYMENT_INCREASE_PRIVILEGE_PCT = 100.0

# ── Land transfer tax. Tiers are (upper bound or None, rate %). ─────────────
# Approximations where a municipality varies; `ltt_basis` always says which
# rule was applied so the UI can be honest about it.

_ON_TIERS = [(55_000.0, 0.5), (250_000.0, 1.0), (400_000.0, 1.5), (2_000_000.0, 2.0), (None, 2.5)]
_TORONTO_TIERS = [
    (55_000.0, 0.5), (250_000.0, 1.0), (400_000.0, 1.5), (2_000_000.0, 2.0),
    (3_000_000.0, 2.5), (4_000_000.0, 3.5), (5_000_000.0, 4.5), (None, 5.5),
]
_BC_TIERS = [(200_000.0, 1.0), (2_000_000.0, 2.0), (3_000_000.0, 3.0), (None, 5.0)]
_MB_TIERS = [(30_000.0, 0.0), (90_000.0, 0.5), (150_000.0, 1.0), (200_000.0, 1.5), (None, 2.0)]
_QC_TIERS = [(61_500.0, 0.5), (307_800.0, 1.0), (None, 1.5)]
_MONTREAL_TIERS = [
    (61_500.0, 0.5), (307_800.0, 1.0), (552_300.0, 1.5), (1_104_700.0, 2.0),
    (2_136_500.0, 2.5), (3_113_000.0, 3.5), (None, 4.0),
]

# province -> (tiers, first-time-buyer rebate cap CAD, label)
_PROVINCE_LTT: Dict[str, Tuple[Optional[List[Tuple[Optional[float], float]]], float, str]] = {
    "ON": (_ON_TIERS, 4000.0, "Ontario land transfer tax"),
    "BC": (_BC_TIERS, 8000.0, "BC property transfer tax"),
    "MB": (_MB_TIERS, 0.0, "Manitoba land transfer tax"),
    "QC": (_QC_TIERS, 0.0, "Quebec transfer duties"),
    "NS": ([(None, 1.5)], 0.0, "Nova Scotia deed transfer tax (Halifax rate)"),
    "NB": ([(None, 1.0)], 0.0, "New Brunswick real property transfer tax"),
    "PE": ([(None, 1.0)], 2000.0, "PEI real property transfer tax"),
    "NL": ([(None, 0.4)], 0.0, "Newfoundland registration fee"),
    "SK": ([(None, 0.3)], 0.0, "Saskatchewan title registration fee"),
    "AB": (None, 0.0, "Alberta has no land transfer tax, only registration fees"),
    "YT": (None, 0.0, "Yukon has no land transfer tax, only registration fees"),
    "NT": (None, 0.0, "NWT has no land transfer tax, only registration fees"),
    "NU": (None, 0.0, "Nunavut has no land transfer tax, only registration fees"),
}
_NO_LTT_REGISTRATION_CAD = 300.0

# BC's first-time-buyer exemption phases out between these two prices.
_BC_FTB_FULL_EXEMPTION_CEILING_CAD = 835_000.0
_BC_FTB_PARTIAL_EXEMPTION_CEILING_CAD = 860_000.0

# PST charged on the CMHC premium, payable at closing (not financeable).
_PST_ON_PREMIUM_PCT: Dict[str, float] = {"ON": 8.0, "QC": 9.0, "MB": 7.0, "SK": 6.0}

_TORONTO_ALIASES = {"toronto", "city of toronto", "north york", "scarborough", "etobicoke"}
_MONTREAL_ALIASES = {"montreal", "montréal", "ville de montreal", "ville de montréal"}


# T001 - error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}

def mortgage_payment_estimate(
    property_price_cad: float,
    down_payment_cad: float,
    interest_rate_pct: float,
    amortization_years: float = STANDARD_AMORTIZATION_YEARS,
    payment_frequency: str = "monthly",
    rate_type: str = "fixed",
    province: str = "ON",
    property_city: str = "",
    property_type: str = "Detached",
    first_time_buyer: bool = False,
    newly_built: bool = False,
) -> Dict[str, Any]:
    """Full payment picture for one property price / rate / frequency combination."""
    try:
        price = float(property_price_cad or 0)
        down = float(down_payment_cad or 0)
        rate = float(interest_rate_pct or 0)
        years = float(amortization_years or STANDARD_AMORTIZATION_YEARS)
    except (TypeError, ValueError):
        return {"status": "error", "message": "Numeric inputs required."}

    if price <= 0:
        return {"status": "error", "message": "Property price is required."}
    if rate <= 0:
        return {"status": "error", "message": "An interest rate is required."}
    if down < 0:
        down = 0.0

    freq_key = payment_frequency if payment_frequency in FREQUENCIES else "monthly"
    periods_per_year, accelerated = FREQUENCIES[freq_key]
    prov = (province or "ON").strip().upper()[:2]
    city_key = (property_city or "").strip().lower()

    # ── Down payment and insurance. ─────────────────────────────────────────
    min_down = _minimum_down_payment_cad(price)
    shortfall = max(round(min_down - down, 2), 0.0)
    down_pct = round((down / price) * 100.0, 2) if price else 0.0

    base_loan = max(price - down, 0.0)
    base_ltv_pct = round((base_loan / price) * 100.0, 2) if price else 0.0

    insurable, insurable_reason = _is_insurable(price, base_ltv_pct, years, first_time_buyer, newly_built)
    insured = bool(down_pct < CONVENTIONAL_DOWN_PCT and insurable and base_loan > 0)

    premium_pct = 0.0
    premium_cad = 0.0
    if insured:
        premium_pct = _premium_pct_for_ltv(base_ltv_pct)
        if years > STANDARD_AMORTIZATION_YEARS:
            premium_pct = round(premium_pct + CMHC_LONG_AMORTIZATION_SURCHARGE_PCT, 2)
        premium_cad = round(base_loan * premium_pct / 100.0, 2)

    total_mortgage = round(base_loan + premium_cad, 2)
    effective_ltv_pct = round((total_mortgage / price) * 100.0, 2) if price else 0.0

    # PST on the premium is due at closing in cash — it cannot be financed.
    premium_pst_cad = round(premium_cad * _PST_ON_PREMIUM_PCT.get(prov, 0.0) / 100.0, 2)

    # ── The payment itself. ─────────────────────────────────────────────────
    compounding = 2 if (rate_type or "fixed").lower() == "fixed" else 12
    monthly_rate = _periodic_rate(rate, 12, compounding)
    monthly_payment = _payment_for(total_mortgage, monthly_rate, int(round(years * 12)))

    period_rate = _periodic_rate(rate, periods_per_year, compounding)
    if accelerated:
        # Accelerated = half (or a quarter of) the monthly payment, kept at the
        # same calendar cadence. The extra payment a year is the whole point.
        per_period = monthly_payment / (2.0 if periods_per_year == 26 else 4.0)
    else:
        per_period = _payment_for(total_mortgage, period_rate, int(round(years * periods_per_year)))

    schedule = _amortize(total_mortgage, period_rate, per_period, int(round(years * periods_per_year * 1.5)) + 12)
    if schedule is None:
        return {"status": "error", "message": "That rate and amortization cannot repay the loan."}
    periods_used, total_interest, balances = schedule

    actual_years = round(periods_used / float(periods_per_year), 2)
    monthly_equivalent = round(per_period * periods_per_year / 12.0, 2)

    # ── Costs around the payment. ───────────────────────────────────────────
    ltt = _land_transfer_tax(price, prov, city_key, bool(first_time_buyer))
    other_closing = round(
        CLOSING_LEGAL_CAD + CLOSING_TITLE_INSURANCE_CAD + CLOSING_APPRAISAL_CAD + CLOSING_INSPECTION_CAD,
        2,
    )
    cash_needed_at_closing = round(down + ltt["net_cad"] + other_closing + premium_pst_cad, 2)

    is_condo = "condo" in (property_type or "").lower()
    housing = {
        "property_tax_monthly_cad": round(price * ASSUMED_PROPERTY_TAX_MONTHLY_PCT / 100.0, 2),
        "heat_monthly_cad": ASSUMED_HEAT_MONTHLY_CAD,
        "maintenance_monthly_cad": round(price * ASSUMED_MAINTENANCE_MONTHLY_PCT / 100.0, 2),
        "condo_fee_monthly_cad": round(price * ASSUMED_CONDO_FEE_MONTHLY_PCT / 100.0, 2) if is_condo else 0.0,
    }
    # Only half of condo fees count toward the lender's GDS calculation.
    housing_for_gds = (
        housing["property_tax_monthly_cad"]
        + housing["heat_monthly_cad"]
        + housing["condo_fee_monthly_cad"] * 0.5
    )
    total_monthly_cost = round(monthly_equivalent + sum(housing.values()), 2)

    return {
        "status": "success",
        "payment_per_period_cad": round(per_period, 2),
        "payment_frequency": freq_key,
        "payment_frequency_label": FREQUENCY_LABELS[freq_key],
        "payments_per_year": periods_per_year,
        "is_accelerated": accelerated,
        "monthly_equivalent_cad": monthly_equivalent,
        "monthly_payment_cad": round(monthly_payment, 2),
        "interest_rate_pct": rate,
        "rate_type": (rate_type or "fixed").lower(),
        "compounding_per_year": compounding,
        "compounding_basis": "semi-annually, not in advance" if compounding == 2 else "monthly",
        "loan_principal_cad": round(base_loan, 2),
        "total_mortgage_cad": total_mortgage,
        "down_payment_cad": round(down, 2),
        "down_payment_pct": down_pct,
        "minimum_down_payment_cad": min_down,
        "down_payment_shortfall_cad": shortfall,
        "meets_minimum_down": shortfall <= 0.0,
        # Base LTV is what people mean by "LTV" and what sets the premium band.
        # Effective LTV is after the premium is added to the principal.
        "loan_to_value_pct": base_ltv_pct,
        "effective_loan_to_value_pct": effective_ltv_pct,
        "insured": insured,
        "insurable": insurable,
        "insurable_note": insurable_reason,
        "cmhc_premium_pct": premium_pct,
        "cmhc_premium_cad": premium_cad,
        "cmhc_premium_pst_cad": premium_pst_cad,
        "amortization_years_requested": years,
        "amortization_years_actual": actual_years,
        "total_interest_cad": round(total_interest, 2),
        "total_cost_of_borrowing_cad": round(total_interest + premium_cad, 2),
        "mortgage_free_date": _mortgage_free_date(periods_used, periods_per_year),
        "balance_curve": _sample_curve(total_mortgage, balances, periods_per_year),
        "land_transfer_tax_cad": ltt["gross_cad"],
        "land_transfer_tax_rebate_cad": ltt["rebate_cad"],
        "land_transfer_tax_net_cad": ltt["net_cad"],
        "land_transfer_tax_basis": ltt["basis"],
        "other_closing_costs_cad": other_closing,
        "closing_costs_estimate_cad": round(ltt["net_cad"] + other_closing + premium_pst_cad, 2),
        "cash_needed_at_closing_cad": cash_needed_at_closing,
        "housing_cost_breakdown": housing,
        "housing_cost_for_gds_monthly_cad": round(housing_for_gds, 2),
        "total_monthly_cost_of_ownership_cad": total_monthly_cost,
        "prepayment_scenarios": _prepayment_scenarios(
            total_mortgage, rate, compounding, years, monthly_payment, total_interest, periods_per_year, accelerated
        ),
        "annual_lump_sum_privilege_pct": ANNUAL_LUMP_SUM_PRIVILEGE_PCT,
        "annual_lump_sum_privilege_cad": round(total_mortgage * ANNUAL_LUMP_SUM_PRIVILEGE_PCT / 100.0, 2),
        "payment_increase_privilege_pct": PAYMENT_INCREASE_PRIVILEGE_PCT,
        "is_provisional": True,
    }


# ── Down payment and insurance rules. ───────────────────────────────────────

def _minimum_down_payment_cad(price: float) -> float:
    """5% of the first $500k, 10% to the insured ceiling, 20% above it."""
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


def _is_insurable(
    price: float, ltv_pct: float, years: float, first_time_buyer: bool, newly_built: bool
) -> Tuple[bool, str]:
    if price > INSURED_PRICE_CEILING_CAD:
        return False, "Above the $1.5M insured ceiling, so 20% down is required."
    if ltv_pct > MAX_INSURED_LTV_PCT:
        return False, "Loan-to-value above 95% cannot be insured."
    if years > STANDARD_AMORTIZATION_YEARS and not (first_time_buyer or newly_built):
        return False, (
            "A 30-year insured amortization is limited to first-time buyers and newly built homes."
        )
    return True, ""


# ── Payment maths. ──────────────────────────────────────────────────────────

def _periodic_rate(annual_rate_pct: float, periods_per_year: int, compounding_per_year: int) -> float:
    """Convert a nominal Canadian quoted rate into a true per-period rate."""
    nominal = annual_rate_pct / 100.0
    if nominal <= 0:
        return 0.0
    effective_annual = (1.0 + nominal / compounding_per_year) ** compounding_per_year - 1.0
    return (1.0 + effective_annual) ** (1.0 / periods_per_year) - 1.0


def _payment_for(principal: float, periodic_rate: float, periods: int) -> float:
    """Unrounded. Round only for display — amortizing a payment already rounded
    to cents accumulates a tail that bills a whole spurious extra period."""
    if principal <= 0 or periods <= 0:
        return 0.0
    if periodic_rate <= 0:
        return principal / periods
    factor = periodic_rate / (1.0 - (1.0 + periodic_rate) ** (-periods))
    return principal * factor


def _amortize(
    principal: float, periodic_rate: float, payment: float, max_periods: int
) -> Optional[Tuple[int, float, List[float]]]:
    """Walk the schedule. Returns None if the payment never clears the interest."""
    if payment <= 0:
        return None
    balance = principal
    total_interest = 0.0
    periods = 0
    balances: List[float] = []
    while balance > 0.005 and periods < max_periods:
        interest = balance * periodic_rate
        principal_part = payment - interest
        if principal_part <= 0:
            return None
        # Lenders adjust the final payment rather than bill a whole extra
        # period for a float-noise residue.
        if principal_part > balance or balance - principal_part < 0.01:
            principal_part = balance
        balance -= principal_part
        total_interest += interest
        periods += 1
        balances.append(round(balance, 2))
    return periods, total_interest, balances


def _sample_curve(opening: float, balances: List[float], periods_per_year: int) -> List[Dict[str, Any]]:
    """Thin the schedule down to one point a year for the sparkline."""
    curve: List[Dict[str, Any]] = [{"year": 0, "balance_cad": round(opening, 2)}]
    if not balances:
        return curve
    years = int(math.ceil(len(balances) / float(periods_per_year)))
    for year in range(1, years + 1):
        idx = min(year * periods_per_year - 1, len(balances) - 1)
        curve.append({"year": year, "balance_cad": balances[idx]})
    # The final sample can repeat a zero balance when the last year is partial.
    if len(curve) > 2 and curve[-1]["balance_cad"] == curve[-2]["balance_cad"]:
        curve.pop()
    return curve


def _mortgage_free_date(periods: int, periods_per_year: int) -> str:
    months = int(round(periods / float(periods_per_year) * 12))
    today = date.today()
    total = today.month - 1 + months
    return date(today.year + total // 12, total % 12 + 1, 1).strftime("%B %Y")


# ── Prepayment scenarios: the soft-suggestion fuel. ─────────────────────────

def _prepayment_scenarios(
    principal: float,
    rate: float,
    compounding: int,
    years: float,
    monthly_payment: float,
    baseline_interest: float,
    baseline_periods_per_year: int,
    baseline_accelerated: bool,
) -> List[Dict[str, Any]]:
    """Each scenario is measured against the customer's CURRENT choice."""
    baseline_years = years
    scenarios: List[Dict[str, Any]] = []

    def _add(key: str, label: str, blurb: str, per_year: int, payment: float, annual_lump: float = 0.0) -> None:
        period_rate = _periodic_rate(rate, per_year, compounding)
        result = _amortize_with_lump(principal, period_rate, payment, per_year, annual_lump, int(years * per_year * 2) + 12)
        if result is None:
            return
        periods, interest = result
        new_years = periods / float(per_year)
        scenarios.append({
            "scenario_id": key,
            "label": label,
            "blurb": blurb,
            "payment_per_period_cad": round(payment, 2),
            "payments_per_year": per_year,
            "amortization_years": round(new_years, 2),
            "total_interest_cad": round(interest, 2),
            "interest_saved_cad": round(max(baseline_interest - interest, 0.0), 2),
            "years_sooner": round(max(baseline_years - new_years, 0.0), 2),
        })

    if not baseline_accelerated:
        _add(
            "accelerated_bi_weekly",
            "Accelerated bi-weekly",
            "Pay half your monthly amount every two weeks. That is one extra monthly payment a year.",
            26,
            monthly_payment / 2.0,
        )
    _add(
        "payment_increase_10",
        "Increase your payment 10%",
        "You can raise your payment by up to 100% of the original without a charge.",
        12,
        monthly_payment * 1.10,
    )
    # Modelled at a realistic 5% a year, well inside the 15% privilege, so the
    # saving we quote is one the customer could actually repeat every year.
    _add(
        "annual_lump_sum",
        "Annual lump sum of 5%",
        "Your privilege allows up to 15% a year with no charge. This models a steady 5%.",
        12,
        monthly_payment,
        annual_lump=principal * 0.05,
    )
    return [s for s in scenarios if s["interest_saved_cad"] > 0]


def _amortize_with_lump(
    principal: float, periodic_rate: float, payment: float, periods_per_year: int,
    annual_lump: float, max_periods: int,
) -> Optional[Tuple[int, float]]:
    if payment <= 0:
        return None
    balance = principal
    total_interest = 0.0
    periods = 0
    while balance > 0.005 and periods < max_periods:
        interest = balance * periodic_rate
        principal_part = payment - interest
        if principal_part <= 0:
            return None
        balance -= min(principal_part, balance)
        total_interest += interest
        periods += 1
        if annual_lump > 0 and periods % periods_per_year == 0 and balance > 0:
            balance -= min(annual_lump, balance)
    return periods, total_interest


# ── Land transfer tax. ──────────────────────────────────────────────────────

def _land_transfer_tax(price: float, province: str, city_key: str, first_time_buyer: bool) -> Dict[str, Any]:
    entry = _PROVINCE_LTT.get(province)
    if entry is None:
        return {
            "gross_cad": _NO_LTT_REGISTRATION_CAD,
            "rebate_cad": 0.0,
            "net_cad": _NO_LTT_REGISTRATION_CAD,
            "basis": "Registration fees only; no land transfer tax in this province.",
        }
    tiers, ftb_cap, label = entry
    if tiers is None:
        return {
            "gross_cad": _NO_LTT_REGISTRATION_CAD,
            "rebate_cad": 0.0,
            "net_cad": _NO_LTT_REGISTRATION_CAD,
            "basis": label,
        }

    if province == "QC" and city_key in _MONTREAL_ALIASES:
        tiers, label = _MONTREAL_TIERS, "Montreal welcome tax (approximate)"

    gross = _tiered_tax(price, tiers)
    basis = label
    rebate = 0.0

    if province == "ON":
        in_toronto = city_key in _TORONTO_ALIASES
        if in_toronto:
            municipal = _tiered_tax(price, _TORONTO_TIERS)
            gross = round(gross + municipal, 2)
            basis = "Ontario land transfer tax plus Toronto municipal land transfer tax"
        if first_time_buyer:
            rebate = min(gross, ftb_cap + (4475.0 if in_toronto else 0.0))
    elif province == "BC" and first_time_buyer:
        rebate = _bc_ftb_rebate(price, gross, ftb_cap)
    elif first_time_buyer and ftb_cap > 0:
        rebate = min(gross, ftb_cap)

    rebate = round(rebate, 2)
    return {
        "gross_cad": gross,
        "rebate_cad": rebate,
        "net_cad": round(max(gross - rebate, 0.0), 2),
        "basis": basis,
    }


def _bc_ftb_rebate(price: float, gross: float, cap: float) -> float:
    """Full exemption to $835k (capped), phasing out linearly to $860k."""
    if price <= _BC_FTB_FULL_EXEMPTION_CEILING_CAD:
        return min(gross, cap)
    if price >= _BC_FTB_PARTIAL_EXEMPTION_CEILING_CAD:
        return 0.0
    span = _BC_FTB_PARTIAL_EXEMPTION_CEILING_CAD - _BC_FTB_FULL_EXEMPTION_CEILING_CAD
    remaining = (_BC_FTB_PARTIAL_EXEMPTION_CEILING_CAD - price) / span
    return min(gross, cap * remaining)


def _tiered_tax(amount: float, tiers: List[Tuple[Optional[float], float]]) -> float:
    tax = 0.0
    lower = 0.0
    for upper, rate_pct in tiers:
        ceiling = amount if upper is None else min(amount, upper)
        if ceiling > lower:
            tax += (ceiling - lower) * rate_pct / 100.0
            lower = ceiling
        if upper is not None and amount <= upper:
            break
    return round(tax, 2)
