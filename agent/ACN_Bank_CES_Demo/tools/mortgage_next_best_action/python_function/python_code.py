"""Ranked, evidence-backed suggestions for the mortgage journey.

This tool is AUTHORITATIVE for suggestion copy, in the same way
build_travel_protection_banner is authoritative for protection banner copy.
The agent renders what this returns. It must not compose its own suggestion,
and it must not restate a number this tool did not produce.

Why a tool and not a prompt: a suggestion that carries a number is only useful
if the number is right. Every figure below is computed here from figures the
other mortgage tools already produced, so there is nothing for the model to
invent and nothing to drift.

House style, ported from the Trip Readiness protection flow, which is the
only other cross-product nudge in this app:

  - Every suggestion is a SEPARATE OPTIONAL REVIEW. Never the next mandatory
    step, never a prerequisite, never a blocker.
  - 60 words maximum per body, and it ends in one clear question.
  - Nothing is added or charged automatically. Saying yes records interest.
  - Acknowledge what the customer already has before offering a layer on top.
  - Plain ASCII only, per the global webchat JSON cleanliness rule.
  - A declined suggestion never comes back. Pass declined_suggestion_ids.

Before calling this tool, speak a brief conversational pacing phrase:
'Let me look at what makes sense as a next step.' Composite V1 runs the call synchronously, so without a
spoken bridge the caller hears dead air while the maths completes.
"""

from typing import Any, Dict, List, Optional, Tuple

# Kept in step with mortgage_rate_board.
PRIME_RATE_PCT = 4.45
BEST_FIXED_RATE_PCT = 4.09
BEST_VARIABLE_RATE_PCT = 3.35
HELOC_RATE_PCT = 4.95
RATE_HOLD_DAYS = 120
CASHBACK_OFFER_CAD = 5100.0

CONVENTIONAL_DOWN_PCT = 20.0
STANDARD_AMORTIZATION_YEARS = 25.0
HELOC_MAX_COMBINED_LTV_PCT = 80.0
REFINANCE_MAX_LTV_PCT = 80.0

FHSA_ANNUAL_LIMIT_CAD = 8_000.0
FHSA_LIFETIME_LIMIT_CAD = 40_000.0
HBP_WITHDRAWAL_LIMIT_CAD = 60_000.0

# Debt load at which consolidating into the mortgage is worth raising.
CONSOLIDATION_DEBT_THRESHOLD_CAD = 700.0
# Typical unsecured rate used only to frame the consolidation saving.
ASSUMED_UNSECURED_RATE_PCT = 19.99

WORD_BUDGET = 60

# First-time-buyer land transfer tax rebate caps, by province.
_FTB_LTT_REBATE_CAD: Dict[str, float] = {"ON": 4000.0, "BC": 8000.0, "PE": 2000.0}
_TORONTO_FTB_REBATE_CAD = 4475.0

# Which moments a suggestion is a natural fit for. "any" always fits.
_MOMENTS = (
    "affordability_result",
    "calculator_result",
    "rate_shelf",
    "rate_indecision",
    "preapproval_verdict",
    "heloc",
    "refinance",
    "handoff",
)


# T001 - error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}

def mortgage_next_best_action(
    moment: str = "",
    property_price_cad: float = 0,
    down_payment_cad: float = 0,
    down_payment_pct: float = 0,
    loan_principal_cad: float = 0,
    loan_to_value_pct: float = 0,
    monthly_payment_cad: float = 0,
    interest_rate_pct: float = 0,
    rate_type: str = "",
    amortization_years: float = STANDARD_AMORTIZATION_YEARS,
    payment_frequency: str = "monthly",
    cmhc_premium_cad: float = 0,
    province: str = "",
    property_city: str = "",
    first_time_buyer: bool = False,
    gross_annual_income_cad: float = 0,
    monthly_debt_obligations_cad: float = 0,
    verdict: str = "",
    max_affordable_price_cad: float = 0,
    home_value_cad: float = 0,
    existing_mortgage_balance_cad: float = 0,
    existing_mortgage_rate_pct: float = 0,
    has_mortgage_protection: bool = False,
    declined_suggestion_ids: str = "",
    max_suggestions: int = 2,
) -> Dict[str, Any]:
    """Return at most max_suggestions suggestions, most relevant first."""
    try:
        price = float(property_price_cad or 0)
        down = float(down_payment_cad or 0)
        down_pct = float(down_payment_pct or 0)
        principal = float(loan_principal_cad or 0)
        payment = float(monthly_payment_cad or 0)
        rate = float(interest_rate_pct or 0)
        years = float(amortization_years or STANDARD_AMORTIZATION_YEARS)
        premium = float(cmhc_premium_cad or 0)
        income = float(gross_annual_income_cad or 0)
        debts = float(monthly_debt_obligations_cad or 0)
        home_value = float(home_value_cad or 0)
        existing_balance = float(existing_mortgage_balance_cad or 0)
        existing_rate = float(existing_mortgage_rate_pct or 0)
        affordable_max = float(max_affordable_price_cad or 0)
        limit = max(int(max_suggestions or 2), 1)
    except (TypeError, ValueError):
        return {"status": "error", "message": "Numeric inputs required."}

    moment_key = (moment or "").strip().lower()
    if moment_key not in _MOMENTS:
        moment_key = ""
    prov = (province or "").strip().upper()[:2]
    rate_kind = (rate_type or "").strip().lower()
    declined = {
        s.strip() for s in (declined_suggestion_ids or "").split(",") if s.strip()
    }

    # Derive down payment percentage if only the amounts came through.
    if down_pct <= 0 and price > 0 and down > 0:
        down_pct = round(down / price * 100.0, 2)

    candidates: List[Dict[str, Any]] = []

    _cmhc_and_down_payment(candidates, price, down, down_pct, premium, prov, bool(first_time_buyer))
    _first_home_accounts(candidates, price, down, down_pct, bool(first_time_buyer), affordable_max)
    _land_transfer_rebate(candidates, price, prov, property_city, bool(first_time_buyer))
    _rate_suggestions(candidates, moment_key, rate_kind, principal, years, payment)
    _amortization_surcharge(candidates, years, down_pct, bool(first_time_buyer))
    _prepayment(candidates, principal, rate, years, rate_kind, payment_frequency)
    _home_equity(candidates, home_value, existing_balance)
    _refinance(candidates, existing_balance, existing_rate, years)
    _consolidation(candidates, debts, home_value, existing_balance)
    _protection(candidates, verdict, payment, bool(has_mortgage_protection))
    _rate_hold(candidates, verdict, rate, rate_kind)
    _recovery(candidates, verdict, price, affordable_max, down, down_pct, income, debts)

    # Drop anything the customer has already turned down, then rank.
    live = [c for c in candidates if c["suggestion_id"] not in declined]
    for c in live:
        c["priority"] = _score(c, moment_key)
        c["word_count"] = len(c["body"].split())
    live.sort(key=lambda c: (-c["priority"], c["suggestion_id"]))

    chosen = live[:limit]
    for c in chosen:
        c.setdefault("decline_label", "Not now")
        c.setdefault("decline_value", "mortgage_suggestion_decline:" + c["suggestion_id"])

    return {
        "status": "success",
        "moment": moment_key,
        "suggestions": chosen,
        "suggestion_count": len(chosen),
        "suppressed_count": len(candidates) - len(live),
        "available_count": len(live),
        "word_budget": WORD_BUDGET,
        "framing": (
            "Offer as a separate optional review. Nothing is added or charged"
            " automatically. One suggestion per turn, and never repeat a decline."
        ),
    }


# ── Rules. Each appends at most one suggestion. ─────────────────────────────

def _cmhc_and_down_payment(
    out: List[Dict[str, Any]], price: float, down: float, down_pct: float,
    premium: float, province: str, first_time_buyer: bool,
) -> None:
    if price <= 0 or down_pct <= 0 or down_pct >= CONVENTIONAL_DOWN_PCT or premium <= 0:
        return
    needed = round(price * CONVENTIONAL_DOWN_PCT / 100.0 - down, 2)
    if needed <= 0:
        return
    out.append({
        "suggestion_id": "cmhc_avoidance",
        "kind": "down_payment",
        "fits": ["calculator_result", "affordability_result", "preapproval_verdict"],
        "title": "Reaching 20 percent down would remove the insurance premium",
        "body": (
            "At {0} percent down your mortgage has to be insured, which adds {1} to the"
            " balance and you pay interest on it for the full term. Another {2} would"
            " take you to 20 percent and remove it entirely. Would you like to see"
            " that side by side?"
        ).format(_pct(down_pct), _money(premium), _money(needed)),
        "evidence": [
            {"label": "Your down payment", "value": _pct(down_pct) + " percent"},
            {"label": "Insurance premium", "value": _money(premium)},
            {"label": "More needed for 20 percent", "value": _money(needed)},
        ],
        "cta_label": "Compare at 20 percent down",
        "cta_value": "mortgage_suggestion_accept:cmhc_avoidance",
        "base_priority": 78,
    })


def _first_home_accounts(
    out: List[Dict[str, Any]], price: float, down: float, down_pct: float,
    first_time_buyer: bool, affordable_max: float,
) -> None:
    if not first_time_buyer:
        return
    if price > 0 and down_pct >= CONVENTIONAL_DOWN_PCT:
        return
    total = FHSA_LIFETIME_LIMIT_CAD + HBP_WITHDRAWAL_LIMIT_CAD
    out.append({
        "suggestion_id": "first_home_accounts",
        "kind": "down_payment",
        "fits": ["affordability_result", "calculator_result", "preapproval_verdict"],
        "title": "Two first-time buyer accounts could lift your down payment",
        "body": (
            "As a first-time buyer you can put {0} a year into an FHSA, up to {1}"
            " lifetime, and withdraw up to {2} from an RRSP under the Home Buyers"
            " Plan. Together that is up to {3} more toward your down payment."
            " Want me to factor that in?"
        ).format(
            _money(FHSA_ANNUAL_LIMIT_CAD), _money(FHSA_LIFETIME_LIMIT_CAD),
            _money(HBP_WITHDRAWAL_LIMIT_CAD), _money(total),
        ),
        "evidence": [
            {"label": "FHSA", "value": _money(FHSA_ANNUAL_LIMIT_CAD) + " a year, " + _money(FHSA_LIFETIME_LIMIT_CAD) + " lifetime"},
            {"label": "Home Buyers Plan", "value": "up to " + _money(HBP_WITHDRAWAL_LIMIT_CAD)},
            {"label": "Combined", "value": "up to " + _money(total)},
        ],
        "cta_label": "Factor this in",
        "cta_value": "mortgage_suggestion_accept:first_home_accounts",
        "base_priority": 70,
    })


def _land_transfer_rebate(
    out: List[Dict[str, Any]], price: float, province: str, city: str, first_time_buyer: bool
) -> None:
    if not first_time_buyer or province not in _FTB_LTT_REBATE_CAD:
        return
    cap = _FTB_LTT_REBATE_CAD[province]
    in_toronto = province == "ON" and (city or "").strip().lower() in {
        "toronto", "north york", "scarborough", "etobicoke",
    }
    if in_toronto:
        cap += _TORONTO_FTB_REBATE_CAD
    where = "Toronto" if in_toronto else province
    out.append({
        "suggestion_id": "land_transfer_rebate",
        "kind": "closing_costs",
        "fits": ["calculator_result", "affordability_result", "preapproval_verdict"],
        "title": "You may be eligible for a land transfer tax rebate",
        "body": (
            "First-time buyers in {0} can claim back up to {1} of land transfer tax at"
            " closing. It is claimed through your lawyer, not through us, and it"
            " lowers the cash you need on closing day. Shall I include it in the"
            " closing cost estimate?"
        ).format(where, _money(cap)),
        "evidence": [
            {"label": "Where", "value": where},
            {"label": "Rebate available", "value": "up to " + _money(cap)},
            {"label": "Claimed", "value": "at closing, through your lawyer"},
        ],
        "cta_label": "Include the rebate",
        "cta_value": "mortgage_suggestion_accept:land_transfer_rebate",
        "base_priority": 55,
    })


def _rate_suggestions(
    out: List[Dict[str, Any]], moment: str, rate_kind: str,
    principal: float, years: float, payment: float,
) -> None:
    gap = _monthly_gap(principal, years)

    if moment == "rate_indecision":
        out.append({
            "suggestion_id": "rate_indecision",
            "kind": "rate_choice",
            "fits": ["rate_indecision", "rate_shelf"],
            "title": "Both are reasonable. Here is the actual trade",
            "body": (
                "Variable starts about {0} a month lower. On our published projection it"
                " passes fixed around month 31, so the saving is front-loaded. Fixed"
                " costs more now and cannot move for five years. Which matters more to"
                " you, the lower payment today or a payment that never changes?"
            ).format(_money(gap)),
            "evidence": [
                {"label": "Variable today", "value": _pct(BEST_VARIABLE_RATE_PCT) + " percent"},
                {"label": "Fixed today", "value": _pct(BEST_FIXED_RATE_PCT) + " percent"},
                {"label": "Difference", "value": _money(gap) + " a month"},
            ],
            "cta_label": "Show the projection",
            "cta_value": "mortgage_suggestion_accept:rate_indecision",
            "base_priority": 95,
        })
        return

    if rate_kind == "variable":
        out.append({
            "suggestion_id": "variable_projection",
            "kind": "rate_choice",
            "fits": ["rate_shelf", "calculator_result", "preapproval_verdict"],
            "title": "What we project for your variable rate",
            "body": (
                "Your rate is prime minus 1.10, so {0} percent today. Published forward"
                " rates point to roughly 3.60 by the end of this year and 4.10 by"
                " mid-2027. That is a projection, not a promise, and you can convert to"
                " fixed at any time without a charge. Want the month-by-month view?"
            ).format(_pct(BEST_VARIABLE_RATE_PCT)),
            "evidence": [
                {"label": "Today", "value": _pct(BEST_VARIABLE_RATE_PCT) + " percent"},
                {"label": "Projected end of 2026", "value": "3.60 percent"},
                {"label": "Projected mid-2027", "value": "4.10 percent"},
                {"label": "Convert to fixed", "value": "any time, no charge"},
            ],
            "cta_label": "See the projection",
            "cta_value": "mortgage_suggestion_accept:variable_projection",
            "base_priority": 82,
        })
    elif rate_kind == "fixed":
        out.append({
            "suggestion_id": "fixed_vs_variable",
            "kind": "rate_choice",
            "fits": ["rate_shelf", "calculator_result"],
            "title": "Variable is lower today, if you want to see it",
            "body": (
                "Fixed is a strong option and your payment cannot move for five years."
                " For comparison, our variable is {0} percent today, about {1} a month"
                " less, though it moves with prime. Happy to leave you on fixed. Would"
                " you like to see them side by side once?"
            ).format(_pct(BEST_VARIABLE_RATE_PCT), _money(gap)),
            "evidence": [
                {"label": "Your fixed rate", "value": _pct(BEST_FIXED_RATE_PCT) + " percent"},
                {"label": "Variable today", "value": _pct(BEST_VARIABLE_RATE_PCT) + " percent"},
                {"label": "Difference", "value": _money(gap) + " a month"},
            ],
            "cta_label": "Compare them",
            "cta_value": "mortgage_suggestion_accept:fixed_vs_variable",
            "base_priority": 48,
        })


def _amortization_surcharge(
    out: List[Dict[str, Any]], years: float, down_pct: float, first_time_buyer: bool
) -> None:
    if years <= STANDARD_AMORTIZATION_YEARS or down_pct <= 0 or down_pct >= CONVENTIONAL_DOWN_PCT:
        return
    out.append({
        "suggestion_id": "amortization_surcharge",
        "kind": "structure",
        "fits": ["calculator_result", "affordability_result", "preapproval_verdict"],
        "title": "A 30-year amortization carries a small premium surcharge",
        "body": (
            "Stretching to {0} years lowers the payment, and as a first-time buyer you"
            " are eligible. It does add 0.20 percent to the insurance premium and more"
            " interest over the life of the loan. Would you like to see 25 and 30 years"
            " next to each other?"
        ).format(int(years)),
        "evidence": [
            {"label": "Amortization", "value": str(int(years)) + " years"},
            {"label": "Premium surcharge", "value": "0.20 percent"},
            {"label": "Eligibility", "value": "first-time buyers and new builds"},
        ],
        "cta_label": "Compare 25 and 30 years",
        "cta_value": "mortgage_suggestion_accept:amortization_surcharge",
        "base_priority": 52,
    })


def _prepayment(
    out: List[Dict[str, Any]], principal: float, rate: float, years: float,
    rate_kind: str, payment_frequency: str,
) -> None:
    if principal <= 0 or rate <= 0 or (payment_frequency or "").startswith("accelerated"):
        return
    compounding = 2 if rate_kind != "variable" else 12
    saving = _accelerated_saving(principal, rate, years, compounding)
    if saving is None:
        return
    interest_saved, years_sooner = saving
    if interest_saved <= 0:
        return
    out.append({
        "suggestion_id": "accelerated_payments",
        "kind": "prepayment",
        "fits": ["calculator_result", "preapproval_verdict", "handoff"],
        "title": "Accelerated bi-weekly would shorten your mortgage",
        "body": (
            "Paying half your monthly amount every two weeks slips in one extra monthly"
            " payment a year. On these numbers that is about {0} less interest and"
            " mortgage-free {1} years sooner, for no extra charge. Want me to set the"
            " estimate to accelerated bi-weekly?"
        ).format(_money(interest_saved), _num(years_sooner)),
        "evidence": [
            {"label": "Interest saved", "value": _money(interest_saved)},
            {"label": "Mortgage-free sooner", "value": _num(years_sooner) + " years"},
            {"label": "Extra cost", "value": "none"},
        ],
        "cta_label": "Switch to accelerated",
        "cta_value": "mortgage_suggestion_accept:accelerated_payments",
        "base_priority": 64,
    })


def _home_equity(out: List[Dict[str, Any]], home_value: float, existing_balance: float) -> None:
    if home_value <= 0:
        return
    ceiling = home_value * HELOC_MAX_COMBINED_LTV_PCT / 100.0
    available = round(ceiling - existing_balance, 2)
    if available <= 10_000:
        return
    out.append({
        "suggestion_id": "home_equity_flexline",
        "kind": "heloc",
        "fits": ["heloc", "refinance", "preapproval_verdict", "handoff"],
        "title": "Your equity could support a Home Equity FlexLine",
        "body": (
            "Based on a {0} home and a {1} balance, you could have around {2} available"
            " as a line of credit at {3} percent, drawn only if you need it. Nothing is"
            " charged unless you use it. Would a separate look at that be useful?"
        ).format(
            _money(home_value), _money(existing_balance), _money(available), _pct(HELOC_RATE_PCT)
        ),
        "evidence": [
            {"label": "Home value", "value": _money(home_value)},
            {"label": "Available credit", "value": _money(available)},
            {"label": "Rate", "value": "prime plus 0.50, " + _pct(HELOC_RATE_PCT) + " percent today"},
            {"label": "Limit", "value": "80 percent of value, less your mortgage"},
        ],
        "cta_label": "Look at the FlexLine",
        "cta_value": "mortgage_suggestion_accept:home_equity_flexline",
        # Above debt_consolidation so the FlexLine leads its own moment, but
        # below refinance_to_lower_rate so a rate saving still wins outright.
        "base_priority": 68,
    })


def _refinance(
    out: List[Dict[str, Any]], existing_balance: float, existing_rate: float, years: float
) -> None:
    if existing_balance <= 0 or existing_rate <= BEST_FIXED_RATE_PCT:
        return
    current = _payment_for(existing_balance, _periodic_rate(existing_rate, 12, 2), int(round(years * 12)))
    improved = _payment_for(existing_balance, _periodic_rate(BEST_FIXED_RATE_PCT, 12, 2), int(round(years * 12)))
    saving = round(current - improved, 2)
    if saving <= 10:
        return
    out.append({
        "suggestion_id": "refinance_to_lower_rate",
        "kind": "refinance",
        "fits": ["refinance", "preapproval_verdict", "handoff"],
        "title": "Your current rate is above what we are offering today",
        "body": (
            "You are at {0} percent and our five-year fixed is {1} percent. On a {2}"
            " balance that is roughly {3} a month less. Breaking a term early can mean a"
            " prepayment charge, so the saving is not always worth it. Want me to look"
            " at the numbers properly?"
        ).format(
            _pct(existing_rate), _pct(BEST_FIXED_RATE_PCT), _money(existing_balance), _money(saving)
        ),
        "evidence": [
            {"label": "Your rate", "value": _pct(existing_rate) + " percent"},
            {"label": "Our five-year fixed", "value": _pct(BEST_FIXED_RATE_PCT) + " percent"},
            {"label": "Indicative saving", "value": _money(saving) + " a month"},
            {"label": "Watch for", "value": "prepayment charge on an early break"},
        ],
        "cta_label": "Check a refinance",
        "cta_value": "mortgage_suggestion_accept:refinance_to_lower_rate",
        "base_priority": 74,
    })


def _consolidation(
    out: List[Dict[str, Any]], debts: float, home_value: float, existing_balance: float
) -> None:
    if debts < CONSOLIDATION_DEBT_THRESHOLD_CAD or home_value <= 0:
        return
    available = round(home_value * REFINANCE_MAX_LTV_PCT / 100.0 - existing_balance, 2)
    if available <= 10_000:
        return
    out.append({
        "suggestion_id": "debt_consolidation",
        "kind": "refinance",
        "fits": ["refinance", "heloc", "preapproval_verdict"],
        "title": "Your other payments could move to a secured rate",
        "body": (
            "You are carrying about {0} a month in other payments. Unsecured credit"
            " often sits near {1} percent, where a secured rate today is {2} percent."
            " Folding them in can free up monthly room, though it stretches the debt"
            " over a longer term. Worth a separate look?"
        ).format(_money(debts), _pct(ASSUMED_UNSECURED_RATE_PCT), _pct(BEST_FIXED_RATE_PCT)),
        "evidence": [
            {"label": "Your monthly debts", "value": _money(debts)},
            {"label": "Typical unsecured rate", "value": _pct(ASSUMED_UNSECURED_RATE_PCT) + " percent"},
            {"label": "Secured rate today", "value": _pct(BEST_FIXED_RATE_PCT) + " percent"},
            {"label": "Trade-off", "value": "lower rate, longer term"},
        ],
        "cta_label": "Look at consolidating",
        "cta_value": "mortgage_suggestion_accept:debt_consolidation",
        "base_priority": 66,
    })


def _protection(
    out: List[Dict[str, Any]], verdict: str, payment: float, has_protection: bool
) -> None:
    if has_protection or (verdict or "").lower() not in ("pre_approved", "needs_review"):
        return
    out.append({
        "suggestion_id": "mortgage_protection",
        "kind": "protection",
        "fits": ["preapproval_verdict", "handoff"],
        "title": "Mortgage protection is worth a separate review",
        "body": (
            "Optional cover that pays down or clears the balance if you die or suffer a"
            " covered critical illness. It is separate from your mortgage application"
            " and changes nothing about your approval. Nothing is added or charged"
            " automatically. Would you like a specialist to walk through it?"
        ),
        "evidence": [
            {"label": "What it covers", "value": "death and covered critical illness"},
            {"label": "Relationship to your application", "value": "separate and optional"},
            {"label": "Charged now", "value": "no"},
        ],
        "cta_label": "Tell me more",
        "cta_value": "mortgage_suggestion_accept:mortgage_protection",
        "base_priority": 58,
    })


def _rate_hold(out: List[Dict[str, Any]], verdict: str, rate: float, rate_kind: str) -> None:
    if (verdict or "").lower() != "pre_approved":
        return
    shown = rate if rate > 0 else BEST_FIXED_RATE_PCT
    out.append({
        "suggestion_id": "rate_hold",
        "kind": "rate_hold",
        "fits": ["preapproval_verdict", "handoff", "rate_shelf"],
        "title": "We can hold this rate for 120 days",
        "body": (
            "With a pre-approval we can hold {0} percent for {1} days while you shop. If"
            " rates fall before you close you get the lower one. Holding a rate does not"
            " commit you to borrowing. Would you like me to note the hold on your file?"
        ).format(_pct(shown), RATE_HOLD_DAYS),
        "evidence": [
            {"label": "Rate held", "value": _pct(shown) + " percent"},
            {"label": "For", "value": str(RATE_HOLD_DAYS) + " days"},
            {"label": "If rates fall", "value": "you get the lower rate"},
            {"label": "Commitment", "value": "none"},
        ],
        "cta_label": "Hold my rate",
        "cta_value": "mortgage_suggestion_accept:rate_hold",
        "base_priority": 86,
    })


def _recovery(
    out: List[Dict[str, Any]], verdict: str, price: float, affordable_max: float,
    down: float, down_pct: float, income: float, debts: float,
) -> None:
    if (verdict or "").lower() != "not_eligible":
        return
    levers: List[Dict[str, str]] = []
    if affordable_max > 0 and price > affordable_max:
        levers.append({"label": "Price that would work", "value": "around " + _money(affordable_max)})
    if down_pct > 0 and down_pct < CONVENTIONAL_DOWN_PCT and price > 0:
        levers.append({
            "label": "A larger down payment",
            "value": _money(price * CONVENTIONAL_DOWN_PCT / 100.0 - down) + " more reaches 20 percent",
        })
    if debts > 0:
        levers.append({"label": "Clearing other debts", "value": _money(debts) + " a month frees room"})
    levers.append({"label": "A co-applicant", "value": "adds their income to the test"})

    out.append({
        "suggestion_id": "affordability_recovery",
        "kind": "recovery",
        "fits": ["preapproval_verdict", "affordability_result"],
        "title": "A few things would change this outcome",
        "body": (
            "We could not pre-approve at these numbers today, and that is about the"
            " numbers rather than about you. A lower price, a larger down payment,"
            " clearing some monthly debt, or adding a co-applicant would each move it."
            " Which of those is realistic for you?"
        ),
        "evidence": levers,
        "cta_label": "Try different numbers",
        "cta_value": "mortgage_suggestion_accept:affordability_recovery",
        "base_priority": 92,
    })


# ── Ranking. ────────────────────────────────────────────────────────────────

def _score(candidate: Dict[str, Any], moment: str) -> int:
    """Base relevance, lifted when the suggestion suits the current moment."""
    score = int(candidate.get("base_priority", 50))
    if moment and moment in candidate.get("fits", []):
        score += 25
    elif moment:
        # Still allowed, but it should lose to anything that fits the moment.
        score -= 20
    return score


# ── Shared maths. Duplicated per tool by convention: CES python tools are ───
# ── standalone files and cannot import one another. ─────────────────────────

def _monthly_gap(principal: float, years: float) -> float:
    """Monthly difference between the best fixed and the best variable today."""
    if principal <= 0:
        return 0.0
    periods = int(round(years * 12))
    fixed = _payment_for(principal, _periodic_rate(BEST_FIXED_RATE_PCT, 12, 2), periods)
    variable = _payment_for(principal, _periodic_rate(BEST_VARIABLE_RATE_PCT, 12, 12), periods)
    return round(max(fixed - variable, 0.0), 2)


def _accelerated_saving(
    principal: float, rate: float, years: float, compounding: int
) -> Optional[Tuple[float, float]]:
    """Interest saved and years shaved by moving to accelerated bi-weekly."""
    monthly_rate = _periodic_rate(rate, 12, compounding)
    monthly_payment = _payment_for(principal, monthly_rate, int(round(years * 12)))
    if monthly_payment <= 0:
        return None

    baseline = _amortize(principal, monthly_rate, monthly_payment, int(years * 12) + 24)
    accelerated = _amortize(
        principal, _periodic_rate(rate, 26, compounding), monthly_payment / 2.0, int(years * 26) + 52
    )
    if baseline is None or accelerated is None:
        return None
    base_periods, base_interest = baseline
    acc_periods, acc_interest = accelerated
    return (
        round(base_interest - acc_interest, 2),
        round(base_periods / 12.0 - acc_periods / 26.0, 2),
    )


def _amortize(
    principal: float, periodic_rate: float, payment: float, max_periods: int
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
        if principal_part > balance or balance - principal_part < 0.01:
            principal_part = balance
        balance -= principal_part
        total_interest += interest
        periods += 1
    return periods, total_interest


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


def _money(value: float) -> str:
    return "CAD {0:,.0f}".format(round(float(value)))


def _pct(value: float) -> str:
    return ("%.2f" % float(value)).rstrip("0").rstrip(".")


def _num(value: float) -> str:
    return ("%.1f" % float(value)).rstrip("0").rstrip(".")
