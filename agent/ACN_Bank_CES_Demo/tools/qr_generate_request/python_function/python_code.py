import hashlib
from datetime import datetime, timezone, timedelta
from typing import Any

def qr_generate_request(amount: str, currency: str = "CAD", description: str = "") -> dict[str, Any]:
    """Generates a QR code payment request for receiving funds.
Generates a QR payment request silently. No pacing phrase required.
"""
    if not amount:
        return {"status": "validation_error", "code": "MISSING_AMOUNT", "data": {}}

    try:
        amount_float = float(amount.replace(",", ""))
    except (ValueError, TypeError):
        return {"status": "validation_error", "code": "INVALID_AMOUNT", "data": {}}

    ref_hash = hashlib.sha256(f"{amount}{currency}{description}".encode()).hexdigest()[:12].upper()
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()

    return {
        "status": "success",
        "data": {
            "qrImageUrl": f"https://pay.acnbank.ca/qr/{ref_hash}.png",
            "deepLink": f"acnpay://request?ref={ref_hash}&amount={amount_float}&currency={currency}",
            "amount": amount_float,
            "currency": currency,
            "description": description or "Payment Request",
            "reference": f"QR-{ref_hash}",
            "expiresAt": expires_at,
            "shareText": f"Please pay {currency} {amount_float:.2f} — {description or 'ACN Bank payment request'}. Use this link: https://pay.acnbank.ca/r/{ref_hash}"
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
