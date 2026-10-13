"""Deterministic EPP monthly-payment maths.

Flat 1.5% one-time processing fee. Monthly amount = (retail * 1.015) / months.

Two call-shapes on the same tool so the agent can:
  A) Show the plan chooser (no chosen tenure) → returns ALL tenures.
  B) Confirm a specific plan (chosen tenure > 0) → returns JUST that plan
     inside `chosen_plan`, so the LLM cannot silently default to 24 months
     when the customer picked 6 or 12.

Design intent: force the agent to pass the tenure the customer actually tapped
by making the "confirm" branch return the tap-derived numbers directly. If the
agent tries to skip the tenure argument it lands in call-shape A and gets a
menu, not a decision — which the pre-approval step then rejects.

Tenures are fixed at [6, 12, 24] for the demo.
"""

from typing import Any, Dict

EPP_INTEREST_RATE_PCT = 1.5
TENURES_MONTHS = [6, 12, 24]


def epp_plan_calculator(
    retail_price_cad: float,
    chosen_tenure_months: int = 0,
) -> Dict[str, Any]:
    try:
        retail = float(retail_price_cad)
    except (TypeError, ValueError):
        retail = 0.0
    if retail <= 0:
        return {"status": "error", "message": "retail_price_cad must be positive"}

    try:
        chosen = int(chosen_tenure_months)
    except (TypeError, ValueError):
        chosen = 0

    total_repayable = round(retail * (1 + EPP_INTEREST_RATE_PCT / 100.0), 2)
    recommended = max(TENURES_MONTHS)

    plans = []
    for months in TENURES_MONTHS:
        monthly = round(total_repayable / months, 2)
        plans.append({
            "tenure_months": months,
            "monthly_amount_cad": monthly,
            "total_repayable_cad": total_repayable,
            "interest_rate_pct": EPP_INTEREST_RATE_PCT,
            "recommended": months == recommended,
        })

    result: Dict[str, Any] = {
        "status": "success",
        "plans": plans,
        "interest_rate_pct": EPP_INTEREST_RATE_PCT,
        "recommended_tenure_months": recommended,
    }

    # Confirm-a-tenure branch. When the agent passes a valid tenure we return
    # the picked plan promoted to `chosen_plan` — this is the ONLY block the
    # pre-approval and create_loan_application steps should read from.
    if chosen in TENURES_MONTHS:
        chosen_monthly = round(total_repayable / chosen, 2)
        result["chosen_plan"] = {
            "tenure_months": chosen,
            "monthly_amount_cad": chosen_monthly,
            "total_repayable_cad": total_repayable,
            "interest_rate_pct": EPP_INTEREST_RATE_PCT,
        }
        result["chosen_tenure_months"] = chosen
    elif chosen != 0:
        # Agent passed something like 18 or 3 — reject explicitly so it can't
        # silently pretend the value was accepted.
        result["chosen_tenure_error"] = (
            "chosen_tenure_months must be one of {}, got {}".format(
                TENURES_MONTHS, chosen
            )
        )

    return result
