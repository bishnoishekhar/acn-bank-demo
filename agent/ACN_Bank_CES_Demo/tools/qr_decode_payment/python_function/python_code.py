import base64
import json
from typing import Any

def qr_decode_payment(qr_payload: str) -> dict[str, Any]:
    """
    Decodes QR payment payload and validates merchant or ACN Bank peer recipient.
    qr_payload: base64-encoded ACN_QR_PAY envelope or URL-formatted QR string.
Decodes a QR payment code silently. No pacing phrase required.
"""
    if not qr_payload:
        return {"status": "validation_error", "code": "MISSING_QR_PAYLOAD", "data": {}}

    raw = str(qr_payload).strip()
    decoded_obj = None
    try:
        if raw.startswith("{"):
            decoded_obj = json.loads(raw)
        else:
            padded = raw + "=" * ((4 - len(raw) % 4) % 4)
            decoded_bytes = base64.urlsafe_b64decode(padded.encode("ascii"))
            decoded_obj = json.loads(decoded_bytes.decode("utf-8"))
    except Exception:
        decoded_obj = None

    if isinstance(decoded_obj, dict) and decoded_obj.get("type") == "ACN_QR_PAY":
        recipient_id = str(decoded_obj.get("customer_id") or "")
        recipient_name = str(decoded_obj.get("display_name") or "ACN Bank Customer")
        amt = float(decoded_obj.get("amount") or 0.0)
        ref = str(decoded_obj.get("reference") or "QR-ACN-DIRECT")
        return {
            "status": "success",
            "data": {
                "qrPayload": raw[:50] + ("..." if len(raw) > 50 else ""),
                "merchantName": recipient_name,
                "recipientCustomerId": recipient_id,
                "merchantId": recipient_id or "ACN-P2P",
                "amount": amt,
                "currency": "CAD",
                "paymentType": "acn_qr_p2p",
                "merchantValidated": bool(recipient_id),
                "merchantRegistryStatus": "active" if recipient_id else "not_found",
                "expiresAt": "2026-12-31T23:59:59Z",
                "reference": ref,
            }
        }

    payload_lower = raw.lower()
    is_interac = "interac" in payload_lower or "e-transfer" in payload_lower
    is_valid_merchant = len(raw) >= 8

    return {
        "status": "success",
        "data": {
            "qrPayload": raw[:50] + ("..." if len(raw) > 50 else ""),
            "merchantName": "Demo Merchant Ltd.",
            "merchantId": "MRCH-78234",
            "amount": 75.00,
            "currency": "CAD",
            "paymentType": "interac_qr" if is_interac else "acn_qr",
            "merchantValidated": is_valid_merchant,
            "merchantRegistryStatus": "active" if is_valid_merchant else "not_found",
            "expiresAt": "2026-12-31T23:59:59Z",
            "reference": "QR-REF-45821"
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
