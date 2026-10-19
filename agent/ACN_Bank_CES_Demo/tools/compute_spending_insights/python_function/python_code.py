from datetime import datetime, timezone, timedelta
from typing import Any

def compute_spending_insights(customer_id: str, period_months: int = 1) -> dict[str, Any]:
    """
    Aggregates transactions by category, computes month-over-month comparison,
    and surfaces proactive banking insights: upcoming utility bills due soon,
    odd/anomalous transactions, spending spikes, idle cash yield opportunities,
    and recurring subscription creep.
Aggregates spending data silently. No pacing phrase required.
"""
    if not customer_id:
        customer_id = str(get_variable("customer_id", "") or get_variable("customerId", "") or "CUST_DOC_1988")
    if period_months <= 0:
        period_months = 1

    now = datetime.now(timezone.utc)
    period_label = now.strftime("%B %Y")
    prev_month = (now - timedelta(days=30)).strftime("%B %Y")
    due_in_2d = (now + timedelta(days=2)).strftime("%Y-%m-%d")
    due_in_4d = (now + timedelta(days=4)).strftime("%Y-%m-%d")
    due_in_6d = (now + timedelta(days=6)).strftime("%Y-%m-%d")
    yesterday_str = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    if customer_id == "6oq3lBNGOFWfqOamn9ob":
        upcoming_bills = [
            {
                "billId": "BILL-INTAN-001",
                "billerName": "Toronto Hydro",
                "category": "utilities",
                "dueAmount": 118.40,
                "currency": "CAD",
                "dueDate": due_in_2d,
                "daysUntilDue": 2,
                "autoPay": False,
                "status": "pending",
                "recommendedCta": "I want to pay my Toronto Hydro bill of CAD 118.40 now"
            },
            {
                "billId": "BILL-INTAN-002",
                "billerName": "Enbridge Gas",
                "category": "utilities",
                "dueAmount": 94.20,
                "currency": "CAD",
                "dueDate": due_in_4d,
                "daysUntilDue": 4,
                "autoPay": False,
                "status": "pending",
                "recommendedCta": "I want to pay my Enbridge Gas bill of CAD 94.20 now"
            },
        ]
    elif customer_id == "CUST_DOC_7777":
        upcoming_bills = [
            {
                "billId": "BILL-7777-001",
                "billerName": "Rogers",
                "category": "telecom",
                "dueAmount": 89.99,
                "currency": "CAD",
                "dueDate": due_in_2d,
                "daysUntilDue": 2,
                "autoPay": False,
                "status": "pending",
                "recommendedCta": "I want to pay my Rogers bill of CAD 89.99 now"
            },
            {
                "billId": "BILL-7777-002",
                "billerName": "Hydro One",
                "category": "utilities",
                "dueAmount": 134.50,
                "currency": "CAD",
                "dueDate": due_in_4d,
                "daysUntilDue": 4,
                "autoPay": False,
                "status": "pending",
                "recommendedCta": "I want to pay my Hydro One bill of CAD 134.50 now"
            },
        ]
    else:
        upcoming_bills = [
            {
                "billId": "BILL-1988-002",
                "billerName": "Enbridge Gas",
                "category": "utilities",
                "dueAmount": 187.40,
                "currency": "CAD",
                "dueDate": due_in_2d,
                "daysUntilDue": 2,
                "autoPay": False,
                "status": "pending",
                "recommendedCta": "I want to pay my Enbridge Gas bill of CAD 187.40 now"
            },
            {
                "billId": "BILL-1988-003",
                "billerName": "Hydro One",
                "category": "utilities",
                "dueAmount": 224.30,
                "currency": "CAD",
                "dueDate": due_in_4d,
                "daysUntilDue": 4,
                "autoPay": False,
                "status": "pending",
                "recommendedCta": "I want to pay my Hydro One bill of CAD 224.30 now"
            },
            {
                "billId": "BILL-1988-001",
                "billerName": "Rogers",
                "category": "telecom",
                "dueAmount": 142.75,
                "currency": "CAD",
                "dueDate": due_in_6d,
                "daysUntilDue": 6,
                "autoPay": False,
                "status": "pending",
                "recommendedCta": "I want to pay my Rogers bill of CAD 142.75 now"
            },
        ]

    anomalies = [
        {
            "transactionId": "TXN-1988-ANOMALY-01",
            "merchant": "Unknown Online Vendor",
            "amount": 249.99,
            "currency": "CAD",
            "date": yesterday_str,
            "time": "02:14 AM",
            "reason": "Out-of-pattern late-night digital purchase (3.4x above your average online transaction) from a first-time merchant.",
            "provisionalCreditEligible": True,
            "recommendedCta": "I don't recognize the $249.99 charge from Unknown Online Vendor and want to dispute it"
        }
    ]

    first_bill = upcoming_bills[0]
    proactive_insights = [
        {
            "insight_type": "bill_automation",
            "headline": f"Upcoming Bill Due in {first_bill['daysUntilDue']} Days: {first_bill['billerName']} (CAD ${first_bill['dueAmount']:.2f})",
            "body": f"Your {first_bill['billerName']} utility bill of CAD ${first_bill['dueAmount']:.2f} is due on {first_bill['dueDate']} and Auto-Pay is currently OFF. Would you like to pay it now to avoid late fees?",
            "cta_label": f"Pay {first_bill['billerName']} (${first_bill['dueAmount']:.2f})",
            "cta_value": first_bill["recommendedCta"]
        },
        {
            "insight_type": "anomaly",
            "headline": "Odd Transaction Spotted: CAD $249.99 at Unknown Online Vendor",
            "body": f"We flagged a CAD $249.99 charge on {yesterday_str} at 2:14 AM from 'Unknown Online Vendor' — 3.4x higher than your usual online spend.",
            "cta_label": "Dispute $249.99 charge",
            "cta_value": "I don't recognize the $249.99 charge from Unknown Online Vendor and want to dispute it"
        },
        {
            "insight_type": "spending_spike",
            "headline": "Entertainment & Dining Trend: Up 36.2% This Month",
            "body": "Your entertainment spend rose to CAD $245.44 (+36.2% vs. last month), while groceries (+6.0% at $842.50) and utilities ($312.00) remained steady.",
            "cta_label": "Review recent transactions",
            "cta_value": "Show my recent transactions"
        },
        {
            "insight_type": "savings_opportunity",
            "headline": "Idle Cash Opportunity: Earn +$121/yr Extra Interest",
            "body": "Moving CAD $2,500 of surplus chequing funds into a High-Interest Savings or 1-Year GIC (up to 4.85% APY) could earn an extra ~$121/year.",
            "cta_label": "Move $2,500 to Savings",
            "cta_value": "Transfer $2,500 from my Chequing account to my Savings account"
        }
    ]

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
                {"merchant": "Unknown Online Vendor (Flagged)", "amount": 249.99},
                {"merchant": "TTC", "amount": 156.00},
            ],
            "upcomingBills": upcoming_bills,
            "anomalies": anomalies,
            "proactiveInsights": proactive_insights,
            "previousPeriod": prev_month,
        }
    }
    return insights

# agent_action: "An unexpected error occurred — please inform the customer and try again."
