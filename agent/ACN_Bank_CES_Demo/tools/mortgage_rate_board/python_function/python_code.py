"""ACN Bank's mortgage rate shelf, plus the variable-rate projection.

One place that owns every rate in the mortgage journey. Before this existed the
illustrative rate was hardcoded in four separate places and they had already
drifted apart.

Two jobs:

  1. Build the shelf — fixed and variable terms, priced for the customer's
     actual principal and payment frequency so the numbers on the cards are
     the numbers they would pay. High-ratio (insured) pricing is genuinely
     cheaper than conventional, which surprises people.

  2. Answer the question customers actually ask about variable: "will it stay
     cheaper?" We publish a projected rate path and the BREAK-EVEN MONTH — the
     month at which cumulative interest on the projected variable path passes
     cumulative interest on the best fixed. That is the honest way to frame the
     trade, and it is a projection, never a promise.

Rates are demo values anchored to the public Sept 2026 market. Tune the
constants and the whole journey follows.

Before calling this tool, speak a brief conversational pacing phrase:
'Let me pull up our current rates.' Composite V1 runs the call synchronously, so without a
spoken bridge the caller hears dead air while the maths completes.
"""

from typing import Any, Dict, List, Optional, Tuple

# ── The market, as of Sept 2026. ────────────────────────────────────────────

PRIME_RATE_PCT = 4.45
OVERNIGHT_RATE_PCT = 2.25
RATE_HOLD_DAYS = 120
CASHBACK_OFFER_CAD = 5100.0

# Projected 5-year variable path. Anchors are (months from now, rate %).
# Sourced from published forward-curve commentary, then held flat past the
# last anchor rather than extrapolating a trend we cannot defend.
VARIABLE_PROJECTION_ANCHORS: List[Tuple[int, float]] = [
    (0, 3.35),
    (4, 3.60),     # end of 2026
    (10, 4.10),    # mid-2027
    (28, 4.35),    # 2028
    (60, 4.35),    # held flat to the end of a 5-year term
]

# The shelf. `spread_from_prime` is set for variable products; `rate_pct` for
# fixed. Exactly one of the two is used per product.
_PRODUCTS: List[Dict[str, Any]] = [
    {
        "product_id": "ACN_FIXED_5Y_CLOSED",
        "name": "5-year fixed closed",
        "rate_type": "fixed",
        "term_years": 5,
        "rate_pct": 4.09,
        "blurb": "Your payment does not move for five years.",
        "high_ratio_only": False,
        "purposes": ["purchase", "refinance", "renewal", "switch"],
    },
    {
        "product_id": "ACN_FIXED_5Y_HIGH_RATIO",
        "name": "5-year fixed closed, high-ratio",
        "rate_type": "fixed",
        "term_years": 5,
        "rate_pct": 3.94,
        "blurb": "A lower rate because the mortgage is insured. Needs less than 20% down.",
        "high_ratio_only": True,
        "purposes": ["purchase"],
    },
    {
        "product_id": "ACN_VARIABLE_5Y_CLOSED",
        "name": "5-year variable closed",
        "rate_type": "variable",
        "term_years": 5,
        "spread_from_prime": -1.10,
        "blurb": "Moves with our prime rate. Lower today, and convertible to fixed any time.",
        "high_ratio_only": False,
        "purposes": ["purchase", "refinance", "renewal", "switch"],
    },
    {
        "product_id": "ACN_FIXED_3Y_CLOSED",
        "name": "3-year fixed closed",
        "rate_type": "fixed",
        "term_years": 3,
        "rate_pct": 4.24,
        "blurb": "A shorter commitment if you expect rates to fall before you renew.",
        "high_ratio_only": False,
        "purposes": ["purchase", "refinance", "renewal", "switch"],
    },
    {
        "product_id": "ACN_FIXED_2Y_CLOSED",
        "name": "2-year fixed closed",
        "rate_type": "fixed",
        "term_years": 2,
        "rate_pct": 4.44,
        "blurb": "The shortest fixed term we offer. Renew sooner, pay a little more now.",
        "high_ratio_only": False,
        "purposes": ["purchase", "refinance", "renewal", "switch"],
    },
]

# The Home Equity FlexLine is a line of credit, not an amortizing mortgage, so
# it is returned separately rather than as a row on the payment shelf.
HELOC_SPREAD_FROM_PRIME_PCT = 0.50
HELOC_MAX_COMBINED_LTV_PCT = 80.0
HELOC_NAME = "ACN Home Equity FlexLine"
REFINANCE_MAX_LTV_PCT = 80.0

HIGH_RATIO_LTV_THRESHOLD_PCT = 80.0
STANDARD_AMORTIZATION_YEARS = 25.0

FREQUENCIES: Dict[str, Tuple[int, bool]] = {
    "monthly": (12, False),
    "semi_monthly": (24, False),
    "bi_weekly": (26, False),
    "weekly": (52, False),
    "accelerated_bi_weekly": (26, True),
    "accelerated_weekly": (52, True),
}

# When no price is known yet (customer asks "just show me rates" before entering
# a property value), use this illustrative principal so the shelf shows real
# payment numbers rather than CAD 0.00. The widget labels them as illustrative.
ILLUSTRATIVE_PRINCIPAL_CAD = 500_000.0


# T001 - error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}

def mortgage_rate_board(
    loan_principal_cad: float = 0,
    amortization_years: float = STANDARD_AMORTIZATION_YEARS,
    payment_frequency: str = "monthly",
    loan_to_value_pct: float = 0,
    purpose: str = "purchase",
    home_value_cad: float = 0,
    existing_mortgage_balance_cad: float = 0,
) -> Dict[str, Any]:
    """The rate shelf priced for this customer, plus the variable projection."""
    try:
        principal = float(loan_principal_cad or 0)
        years = float(amortization_years or STANDARD_AMORTIZATION_YEARS)
        ltv = float(loan_to_value_pct or 0)
        home_value = float(home_value_cad or 0)
        existing_balance = float(existing_mortgage_balance_cad or 0)
    except (TypeError, ValueError):
        return {"status": "error", "message": "Numeric inputs required."}

    freq_key = payment_frequency if payment_frequency in FREQUENCIES else "monthly"
    periods_per_year, accelerated = FREQUENCIES[freq_key]
    purpose_key = (purpose or "purchase").strip().lower()
    if purpose_key not in ("purchase", "refinance", "renewal", "switch"):
        purpose_key = "purchase"

    is_high_ratio = 0 < ltv and ltv > HIGH_RATIO_LTV_THRESHOLD_PCT

    # Use an illustrative default so the shelf always shows real payment numbers.
    payments_illustrative = principal <= 0
    effective_principal = principal if principal > 0 else ILLUSTRATIVE_PRINCIPAL_CAD

    products: List[Dict[str, Any]] = []
    for spec in _PRODUCTS:
        if purpose_key not in spec["purposes"]:
            continue
        # High-ratio pricing is only real if the mortgage is actually insured.
        if spec["high_ratio_only"] and not is_high_ratio:
            continue
        # Conventional 5-year fixed is redundant next to its high-ratio twin.
        if is_high_ratio and spec["product_id"] == "ACN_FIXED_5Y_CLOSED":
            continue

        if spec["rate_type"] == "variable":
            rate = round(PRIME_RATE_PCT + spec["spread_from_prime"], 2)
            spread = spec["spread_from_prime"]
            basis = "Prime {0}% {1} {2}%".format(
                _fmt(PRIME_RATE_PCT), "minus" if spread < 0 else "plus", _fmt(abs(spread))
            )
            compounding = 12
        else:
            rate = float(spec["rate_pct"])
            basis = "Fixed for {0} years, compounded semi-annually".format(spec["term_years"])
            compounding = 2

        payment = _payment_per_period(effective_principal, rate, years, periods_per_year, accelerated, compounding)
        products.append({
            "product_id": spec["product_id"],
            "name": spec["name"],
            "rate_type": spec["rate_type"],
            "term_years": spec["term_years"],
            "rate_pct": rate,
            "rate_basis": basis,
            "payment_per_period_cad": payment,
            "monthly_equivalent_cad": round(payment * periods_per_year / 12.0, 2),
            "blurb": spec["blurb"],
            "badge": "",
            "recommended": False,
        })

    if not products:
        return {"status": "error", "message": "No rate products match that request."}

    best_fixed = _cheapest(products, "fixed")
    best_variable = _cheapest(products, "variable")
    cheapest_overall = min(products, key=lambda p: p["rate_pct"])

    for product in products:
        badges = []
        if product is cheapest_overall:
            badges.append("Lowest today")
        if product["rate_type"] == "fixed":
            badges.append("Payment locked")
        if product["product_id"].endswith("HIGH_RATIO"):
            badges.append("High-ratio")
        product["badge"] = " | ".join(badges)

    # The default highlight is the best fixed: it is the option that cannot
    # surprise the customer later. The agent never states this as advice.
    if best_fixed is not None:
        best_fixed["recommended"] = True

    projection = _projection_series(min(60, int(round(years * 12))))
    # Always return the full shape, never a null. Two reasons: the Vertex
    # validator is unhappy with null-valued typed containers (same reason
    # create_loan_application passes objects as JSON strings), and the widget
    # can then read break_even.* without guarding every field. When there is
    # no principal yet - "just show me your rates" straight off the front
    # door - the figures are zero and crosses_within_horizon is false.
    if best_fixed is not None and best_variable is not None:
        break_even = _break_even(effective_principal, years, best_fixed["rate_pct"], projection)
    else:
        break_even = _empty_break_even(min(int(round(years * 12)), 60))

    return {
        "status": "success",
        "purpose": purpose_key,
        "prime_rate_pct": PRIME_RATE_PCT,
        "overnight_rate_pct": OVERNIGHT_RATE_PCT,
        "is_high_ratio": is_high_ratio,
        "payment_frequency": freq_key,
        "payments_per_year": periods_per_year,
        "loan_principal_cad": round(principal, 2),
        "payments_illustrative": payments_illustrative,
        "illustrative_principal_cad": round(ILLUSTRATIVE_PRINCIPAL_CAD, 2) if payments_illustrative else 0.0,
        "amortization_years": years,
        "products": products,
        "best_fixed_product_id": best_fixed["product_id"] if best_fixed else "",
        "best_fixed_rate_pct": best_fixed["rate_pct"] if best_fixed else 0.0,
        "best_variable_product_id": best_variable["product_id"] if best_variable else "",
        "best_variable_rate_pct": best_variable["rate_pct"] if best_variable else 0.0,
        "variable_saves_today_cad": round(
            best_fixed["monthly_equivalent_cad"] - best_variable["monthly_equivalent_cad"], 2
        ) if (best_fixed and best_variable) else 0.0,
        "variable_projection": projection,
        "variable_projection_disclaimer": (
            "A projection based on published forward rates, not a promise."
            " Your variable rate moves only when our prime rate moves."
        ),
        "break_even": break_even,
        "rate_hold_days": RATE_HOLD_DAYS,
        "cashback_offer_cad": CASHBACK_OFFER_CAD,
        "heloc": _heloc_offer(home_value, existing_balance),
        "refinance_max_ltv_pct": REFINANCE_MAX_LTV_PCT,
        "is_provisional": True,
    }


# ── The variable projection. ────────────────────────────────────────────────

def _projection_series(months: int) -> List[Dict[str, Any]]:
    """Anchor points a UI can plot, plus a label for each."""
    series: List[Dict[str, Any]] = []
    for month, rate in VARIABLE_PROJECTION_ANCHORS:
        if month > months:
            break
        series.append({
            "month": month,
            "label": "Today" if month == 0 else "In {0} months".format(month),
            "rate_pct": rate,
        })
    return series


def _projected_rate_at(month: int) -> float:
    """Linear interpolation between anchors; flat past the last one."""
    anchors = VARIABLE_PROJECTION_ANCHORS
    if month <= anchors[0][0]:
        return anchors[0][1]
    for i in range(1, len(anchors)):
        prev_month, prev_rate = anchors[i - 1]
        next_month, next_rate = anchors[i]
        if month <= next_month:
            span = next_month - prev_month
            if span <= 0:
                return next_rate
            weight = (month - prev_month) / float(span)
            return prev_rate + (next_rate - prev_rate) * weight
    return anchors[-1][1]


def _break_even(
    principal: float, years: float, fixed_rate_pct: float, projection: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """First month where cumulative projected variable interest passes fixed.

    Both sides are walked on a monthly schedule at a payment fixed at the
    outset, which is how a Canadian variable mortgage actually behaves: the
    payment stays put and the interest split moves.
    """
    periods = int(round(years * 12))
    horizon = min(periods, 60)

    fixed_rate = _periodic_rate(fixed_rate_pct, 12, 2)
    fixed_payment = _payment_for(principal, fixed_rate, periods)
    variable_payment = _payment_for(principal, _periodic_rate(_projected_rate_at(0), 12, 12), periods)

    fixed_balance = principal
    variable_balance = principal
    fixed_cumulative = 0.0
    variable_cumulative = 0.0
    break_even_month = 0

    for month in range(1, horizon + 1):
        fixed_interest = fixed_balance * fixed_rate
        fixed_cumulative += fixed_interest
        fixed_balance = max(fixed_balance - (fixed_payment - fixed_interest), 0.0)

        variable_rate = _periodic_rate(_projected_rate_at(month - 1), 12, 12)
        variable_interest = variable_balance * variable_rate
        variable_cumulative += variable_interest
        variable_balance = max(variable_balance - (variable_payment - variable_interest), 0.0)

        if break_even_month == 0 and variable_cumulative > fixed_cumulative:
            break_even_month = month

    return {
        "break_even_month": break_even_month,
        "horizon_months": horizon,
        "crosses_within_horizon": break_even_month > 0,
        "fixed_interest_over_horizon_cad": round(fixed_cumulative, 2),
        "variable_interest_over_horizon_cad": round(variable_cumulative, 2),
        "variable_advantage_over_horizon_cad": round(fixed_cumulative - variable_cumulative, 2),
        "summary": _break_even_summary(break_even_month, horizon, fixed_cumulative - variable_cumulative),
    }


def _empty_break_even(horizon: int) -> Dict[str, Any]:
    """Same keys as _break_even, zeroed. Used when there is no principal yet."""
    return {
        "break_even_month": 0,
        "horizon_months": horizon,
        "crosses_within_horizon": False,
        "fixed_interest_over_horizon_cad": 0.0,
        "variable_interest_over_horizon_cad": 0.0,
        "variable_advantage_over_horizon_cad": 0.0,
        "summary": (
            "Once you tell me a price and a down payment I can work out when"
            " variable would stop being the cheaper of the two."
        ),
    }


def _break_even_summary(month: int, horizon: int, advantage: float) -> str:
    if month <= 0:
        return (
            "On this projection variable stays cheaper for the whole {0}-year term,"
            " saving about {1} in interest.".format(horizon // 12, _money(advantage))
        )
    if advantage >= 0:
        return (
            "On this projection variable costs more than fixed from month {0},"
            " but is still about {1} ahead across the term.".format(month, _money(advantage))
        )
    return (
        "On this projection variable costs more than fixed from month {0},"
        " ending about {1} behind across the term.".format(month, _money(abs(advantage)))
    )


# ── HELOC. ──────────────────────────────────────────────────────────────────

def _heloc_offer(home_value: float, existing_balance: float) -> Dict[str, Any]:
    rate = round(PRIME_RATE_PCT + HELOC_SPREAD_FROM_PRIME_PCT, 2)
    offer: Dict[str, Any] = {
        "name": HELOC_NAME,
        "rate_pct": rate,
        "rate_basis": "Prime {0}% plus {1}%".format(_fmt(PRIME_RATE_PCT), _fmt(HELOC_SPREAD_FROM_PRIME_PCT)),
        "max_combined_ltv_pct": HELOC_MAX_COMBINED_LTV_PCT,
        "revolving": True,
        "uses": ["Renovations", "Debt consolidation", "A vehicle", "An investment"],
        "notes": (
            "Interest-only minimum payments, no prepayment charge, and you can"
            " convert part of the balance to a fixed Term Portion."
        ),
    }
    # Keep the key set identical whether or not we know the home's value, so
    # the model never sees a shifting schema and the agent can read any field
    # without guarding it. Unknown means zero, plus a note saying why.
    ceiling = home_value * HELOC_MAX_COMBINED_LTV_PCT / 100.0 if home_value > 0 else 0.0
    available = max(ceiling - existing_balance, 0.0) if home_value > 0 else 0.0
    offer.update({
        "home_value_cad": round(home_value, 2),
        "existing_mortgage_balance_cad": round(existing_balance, 2),
        "equity_cad": round(max(home_value - existing_balance, 0.0), 2),
        "available_credit_cad": round(available, 2),
        "monthly_interest_only_cad": round(available * rate / 100.0 / 12.0, 2),
        "qualifies": available > 0,
        # Distinct from "notes" above, which describes the product itself.
        # This one says why there is no limit yet, if there isn't.
        "availability_note": (
            "" if home_value > 0
            else "We need the home's value to work out an available limit."
        ),
    })
    return offer


# ── Shared maths. Duplicated per tool by convention: CES python tools are ───
# ── standalone files and cannot import one another. ─────────────────────────

def _payment_per_period(
    principal: float, rate_pct: float, years: float, periods_per_year: int,
    accelerated: bool, compounding: int,
) -> float:
    if principal <= 0:
        return 0.0
    if accelerated:
        monthly = _payment_for(principal, _periodic_rate(rate_pct, 12, compounding), int(round(years * 12)))
        return round(monthly / (2.0 if periods_per_year == 26 else 4.0), 2)
    period_rate = _periodic_rate(rate_pct, periods_per_year, compounding)
    return round(_payment_for(principal, period_rate, int(round(years * periods_per_year))), 2)


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


def _cheapest(products: List[Dict[str, Any]], rate_type: str) -> Optional[Dict[str, Any]]:
    matches = [p for p in products if p["rate_type"] == rate_type]
    return min(matches, key=lambda p: p["rate_pct"]) if matches else None


def _fmt(value: float) -> str:
    return ("%.2f" % value).rstrip("0").rstrip(".")


def _money(value: float) -> str:
    return "CAD {0:,.0f}".format(round(value))
