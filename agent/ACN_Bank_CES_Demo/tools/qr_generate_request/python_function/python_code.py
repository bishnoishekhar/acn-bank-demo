import base64
import hashlib
import json
from datetime import datetime, timezone, timedelta
from typing import Any

def qr_generate_request(amount: str = "0", currency: str = "CAD", description: str = "") -> dict[str, Any]:
    """Generates a QR code payment request for receiving funds.
Generates a QR payment request silently. No pacing phrase required.
"""
    raw_amount = str(amount or "0").replace(",", "").replace("$", "").strip()
    try:
        amount_float = float(raw_amount) if raw_amount else 0.0
    except (ValueError, TypeError):
        amount_float = 0.0

    customer_id = str(get_variable("customer_id", "") or get_variable("customerId", "") or "CUST_DOC_1988")
    display_name = str(
        get_variable("customer_name", "")
        or get_variable("pref_name", "")
        or "Chander Shekhar"
    )

    ref_hash = hashlib.sha256(f"{customer_id}{amount_float}{currency}{description}".encode()).hexdigest()[:12].upper()
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()

    envelope = {
        "type": "ACN_QR_PAY",
        "v": "1",
        "customer_id": customer_id,
        "display_name": display_name,
    }
    if amount_float > 0:
        envelope["amount"] = round(amount_float, 2)
    if description:
        envelope["description"] = description
    envelope["reference"] = f"QR-{ref_hash}"

    qr_payload_b64 = base64.b64encode(json.dumps(envelope).encode("utf-8")).decode("ascii")

    return {
        "status": "success",
        "data": {
            "customerId": customer_id,
            "displayName": display_name,
            "qrPayloadBase64": qr_payload_b64,
            "qrImageUrl": f"https://pay.acnbank.ca/qr/{ref_hash}.png",
            "deepLink": f"acnpay://request?ref={ref_hash}&amount={amount_float}&currency={currency}",
            "amount": amount_float,
            "currency": currency,
            "description": description or "ACN QR Pay Request",
            "reference": f"QR-{ref_hash}",
            "expiresAt": expires_at,
            "shareText": (
                f"Scan this ACN QR code in the ACN Banking mobile app to pay {display_name}"
                + (f" {currency} {amount_float:.2f}" if amount_float > 0 else "")
                + f" (Ref: QR-{ref_hash})."
            )
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
