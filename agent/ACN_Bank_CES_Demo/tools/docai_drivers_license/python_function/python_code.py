import json
from typing import Any

DOCAI_ENDPOINT = "https://us-documentai.googleapis.com/v1/projects/483471568825/locations/us/processors/b53c4d586d70607:process"
CONFIDENCE_THRESHOLD = 0.80
KEY_ENTITIES = {"given_name", "family_name", "date_of_birth", "expiration_date", "document_number"}

def docai_drivers_license(document_base64: str, mime_type: str = "image/jpeg") -> dict[str, Any]:
    """
    Calls DocAI processDriversLicense. Confidence < 0.80 on any key entity → manual_review.
    In demo/mock mode returns realistic stub with all entities at confidence 0.95.
Processing may take several seconds. If a pacing phrase is needed, deliver it from the agent instruction before calling this tool.
"""
    if not document_base64:
        return {"status": "validation_error", "code": "MISSING_DOCUMENT", "data": {}}

    # Stub: simulate successful DocAI response
    # In production, this would call DOCAI_ENDPOINT with the base64 document
    entities = [
        {"type": "given_name", "mentionText": "John", "confidence": 0.97, "normalizedValue": None},
        {"type": "family_name", "mentionText": "Doe", "confidence": 0.96, "normalizedValue": None},
        {"type": "date_of_birth", "mentionText": "1985-03-15", "confidence": 0.95, "normalizedValue": {"dateValue": {"year": 1985, "month": 3, "day": 15}}},
        {"type": "expiration_date", "mentionText": "2028-03-15", "confidence": 0.94, "normalizedValue": {"dateValue": {"year": 2028, "month": 3, "day": 15}}},
        {"type": "document_number", "mentionText": "D12345678", "confidence": 0.99, "normalizedValue": None},
        {"type": "address", "mentionText": "123 Main St, Toronto ON M4B 1A1", "confidence": 0.91, "normalizedValue": {"addressValue": {"city": "Toronto", "state": "ON", "postalCode": "M4B 1A1"}}}
    ]

    # Check confidence threshold
    low_confidence = [e for e in entities if e["type"] in KEY_ENTITIES and e["confidence"] < CONFIDENCE_THRESHOLD]
    manual_review_required = len(low_confidence) > 0

    return {
        "status": "success",
        "data": {
            "processorId": "b53c4d586d70607",
            "entities": entities,
            "extractedData": {
                "givenName": "John",
                "familyName": "Doe",
                "dateOfBirth": "1985-03-15",
                "expirationDate": "2028-03-15",
                "documentNumber": "D12345678",
                "address": "123 Main St, Toronto ON M4B 1A1"
            },
            "manualReviewRequired": manual_review_required,
            "lowConfidenceEntities": [e["type"] for e in low_confidence],
            "overallConfidence": min(e["confidence"] for e in entities if e["type"] in KEY_ENTITIES),
            "mimeType": mime_type,
            "processorEndpoint": DOCAI_ENDPOINT
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
