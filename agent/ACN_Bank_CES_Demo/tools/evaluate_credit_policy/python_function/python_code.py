"""
P17 — evaluate_credit_policy
Credit decision engine for card, mortgage, and loan applications.
Returns decision, credit limit, rate, reason codes, plain-language reasons, adverse action flag.
Before calling this tool, speak a brief pacing phrase: 'Reviewing your application now — this will take just a moment.'

DEMO POLICY (rule based, deterministic). The agent reads the customer's profile with getFinancials and passes the
values in; this tool never invents them. If the profile values are missing it refers the application for manual
review instead of guessing. Thresholds are demo values, tune the constants below to change the outcomes.
"""

# --- demo policy constants -------------------------------------------------------------------------------
MIN_INCOME = 15000.0            # annual income floor for any product
CARD_DECLINE_BELOW = 600        # credit score below this is declined
CARD_REFER_BELOW = 680          # 600..679 goes to manual review
LOAN_DECLINE_BELOW = 620
LOAN_REFER_BELOW = 680
MAX_DEBT_SERVICE = 0.50         # monthly debt x 12 / annual income above this is declined
DEFAULT_CARD_APR = 20.99


def _band(score: int) -> str:
    if score >= 800:
        return "Exceptional"
    if score >= 740:
        return "Very good"
    if score >= 670:
        return "Good"
    if score >= 580:
        return "Fair"
    return "Poor"


def _floor_500(x: float) -> float:
    return float(int(x // 500) * 500)


def _result(decision, limit=0.0, rate=0.0, codes=None, reasons=None, adverse=False, score=0, product="", extra=None):
    out = {
        "status": "success",
        "decision": decision,
        "credit_limit": float(limit),
        "interest_rate": float(rate),
        "reason_codes": codes or [],
        "reasons": reasons or [],
        "adverse_action_required": bool(adverse),
        "credit_score_band": _band(score) if score else "",
        "product_type": product,
    }
    if decision == "approved":
        out["next_step"] = "persist_then_confirm"
    elif decision == "referred":
        out["next_step"] = "manual_review"
    else:
        out["next_step"] = "explain_and_offer_options"
    if extra:
        out.update(extra)
    return out


def evaluate_credit_policy(
    customer_id: str,
    application_id: str,
    product_type: str,
    requested_amount: float = 0.0,
    credit_score: int = 0,
    annual_income: float = 0.0,
    monthly_debt: float = 0.0,
    apr_pct: float = 0.0,
) -> dict:
    """
    Run credit policy evaluation for the given application.

    Args:
        customer_id: Firestore customer document ID.
        application_id: Application document ID to update with decision.
        product_type: Product type: 'credit_card' | 'mortgage' | 'personal_loan' |
                      'line_of_credit' | 'epp'.
        requested_amount: Requested credit limit or loan amount in CAD (0 = let policy decide).
        credit_score: The customer's credit score from getFinancials (credit_score_value).
        annual_income: The customer's annual income in CAD from getFinancials.
        monthly_debt: Existing monthly debt payments in CAD, if known (0 if unknown).
        apr_pct: Purchase APR of the chosen card in percent, if known (0 = standard rate).

    Returns:
        {decision('approved'|'declined'|'referred'), credit_limit, interest_rate,
         reason_codes(list), reasons(list of plain-language reasons), adverse_action_required(bool),
         credit_score_band, next_step}
    """
    mock_mode = get_variable("mock_mode", "false")

    if mock_mode == "true":
        # Mock: approve most applications; decline if requested_amount > 50000
        if requested_amount > 50000:
            return {
                "status": "success",
                "decision": "declined",
                "credit_limit": 0.0,
                "interest_rate": 0.0,
                "reason_codes": ["EXCEEDS_MAX_LIMIT", "DEBT_RATIO_HIGH"],
                "adverse_action_required": True,
            }
        if requested_amount > 25000:
            return {
                "status": "success",
                "decision": "referred",
                "credit_limit": requested_amount * 0.6,
                "interest_rate": 12.99,
                "reason_codes": ["MANUAL_REVIEW_REQUIRED"],
                "adverse_action_required": False,
            }
        return {
            "status": "success",
            "decision": "approved",
            "credit_limit": max(requested_amount, 5000.0),
            "interest_rate": 19.99 if product_type == "credit_card" else 7.49,
            "reason_codes": [],
            "adverse_action_required": False,
        }

    try:
        score = int(float(credit_score or 0))
        income = float(annual_income or 0)
        debt = float(monthly_debt or 0)
        asked = float(requested_amount or 0)
    except (TypeError, ValueError):
        score, income, debt, asked = 0, 0.0, 0.0, 0.0
    ptype = str(product_type or "").strip().lower()

    # Nothing to base a decision on: never guess, send it to a person.
    if score <= 0 or income <= 0:
        return _result("referred", codes=["MISSING_FINANCIAL_DATA"], product=ptype,
                       reasons=["We could not read your income and credit profile, so a specialist needs to review this."])

    if income < MIN_INCOME:
        return _result("declined", codes=["INCOME_BELOW_MINIMUM"], adverse=True, score=score, product=ptype,
                       reasons=["The income on file is below the minimum for this product."])

    dti = (debt * 12.0) / income if debt > 0 else 0.0
    is_card = ptype == "credit_card"
    decline_below = CARD_DECLINE_BELOW if is_card else LOAN_DECLINE_BELOW
    refer_below = CARD_REFER_BELOW if is_card else LOAN_REFER_BELOW

    if score < decline_below:
        return _result("declined", codes=["LOW_CREDIT_SCORE"], adverse=True, score=score, product=ptype,
                       reasons=["The credit score on file is below the level we can approve for this product."])
    if dti > MAX_DEBT_SERVICE:
        return _result("declined", codes=["DEBT_RATIO_HIGH"], adverse=True, score=score, product=ptype,
                       reasons=["Your existing monthly debt payments are high compared with your income."])
    if score < refer_below:
        return _result("referred", codes=["MANUAL_REVIEW_REQUIRED"], score=score, product=ptype,
                       reasons=["Your profile is close to our approval level, so a specialist will review it."])

    # ---- approved -------------------------------------------------------------------------------------
    if is_card:
        tier_cap = 25000.0 if score >= 760 else 15000.0 if score >= 720 else 8000.0
        cap = min(tier_cap, income * 0.25)
        limit = min(asked, cap) if asked > 0 else cap
        limit = max(1000.0, _floor_500(limit))
        rate = float(apr_pct) if apr_pct and float(apr_pct) > 0 else DEFAULT_CARD_APR
        return _result("approved", limit=limit, rate=rate, score=score, product=ptype,
                       reasons=["Your credit profile and income support this limit."])

    # loans / line of credit / epp / mortgage
    cap = min(50000.0 if ptype in ("personal_loan", "line_of_credit", "epp") else 5000000.0, income * 0.5)
    amount = min(asked, cap) if asked > 0 else cap
    amount = max(1000.0, _floor_500(amount))
    rate = 7.49 if score >= 760 else 8.99 if score >= 720 else 10.99
    if ptype == "line_of_credit":
        rate += 1.5
    return _result("approved", limit=amount, rate=rate, score=score, product=ptype,
                   reasons=["Your credit profile and income support this amount."])

# T001 — error recovery response
_ERROR_RESPONSE = {"agent_action": "I'm sorry, I'm having difficulty processing that request right now. Please try again in a moment."}
