import json
from datetime import datetime, timezone, timedelta
from typing import Any

def compute_spending_insights(customer_id: str, period_months: int = 1) -> dict[str, Any]:
    """
    Aggregates transactions by category and computes month-over-month comparison.
    Returns spending breakdown for the requested period and the previous period.
Aggregates spending data silently. No pacing phrase required.
"""
    if not customer_id:
        return {"status": "validation_error", "code": "MISSING_CUSTOMER_ID", "data": {}}
    if period_months <= 0:
        period_months = 1

    # Stub: realistic spending insight data
    now = datetime.now(timezone.utc)
    period_label = now.strftime("%B %Y")
    prev_month = (now - timedelta(days=30)).strftime("%B %Y")

    insights = {
        "status": "success",
        "data": {
            "customerId": customer_id,
            "period": period_label,
            "periodMonths": period_months,
            "totalSpend": 3247.89,
            "totalSpendPrevious": 2981.45,
            "changePercent": 8.9,
            "categories": [
                {"category": "groceries", "amount": 842.50, "previousAmount": 795.00, "changePercent": 6.0, "transactionCount": 12},
                {"category": "dining", "amount": 456.75, "previousAmount": 523.20, "changePercent": -12.7, "transactionCount": 18},
                {"category": "transportation", "amount": 389.20, "previousAmount": 350.00, "changePercent": 11.2, "transactionCount": 8},
                {"category": "utilities", "amount": 312.00, "previousAmount": 312.00, "changePercent": 0.0, "transactionCount": 3},
                {"category": "entertainment", "amount": 245.44, "previousAmount": 180.25, "changePercent": 36.2, "transactionCount": 7},
                {"category": "other", "amount": 1002.00, "previousAmount": 821.00, "changePercent": 22.0, "transactionCount": 14},
            ],
            "topMerchants": [
                {"merchant": "Loblaws", "amount": 342.50},
                {"merchant": "Sobeys", "amount": 300.00},
                {"merchant": "TTC", "amount": 156.00},
            ],
            "previousPeriod": prev_month,
        }
    }
    return insights

# agent_action: "An unexpected error occurred — please inform the customer and try again."
