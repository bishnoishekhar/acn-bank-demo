import re
import json
from typing import Any

def qr_decode_payment(qr_payload: str) -> dict[str, Any]:
    """
    Decodes QR payment payload and validates merchant.
    qr_payload: base64-encoded or URL-formatted QR string.
Decodes a QR payment code silently. No pacing phrase required.
"""
    if not qr_payload:
        return {"status": "validation_error", "code": "MISSING_QR_PAYLOAD", "data": {}}

    # Stub: parse and validate
    payload_lower = qr_payload.lower()
    is_interac = "interac" in payload_lower or "e-transfer" in payload_lower
    is_valid_merchant = len(qr_payload) >= 8  # Stub validation

    return {
        "status": "success",
        "data": {
            "qrPayload": qr_payload[:50] + ("..." if len(qr_payload) > 50 else ""),
            "merchantName": "Demo Merchant Ltd.",
            "merchantId": "MRCH-78234",
            "amount": 75.00,
            "currency": "CAD",
            "paymentType": "interac_qr" if is_interac else "acn_qr",
            "merchantValidated": is_valid_merchant,
            "merchantRegistryStatus": "active" if is_valid_merchant else "not_found",
            "expiresAt": "2026-09-30T23:59:59Z",
            "reference": "QR-REF-45821"
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
