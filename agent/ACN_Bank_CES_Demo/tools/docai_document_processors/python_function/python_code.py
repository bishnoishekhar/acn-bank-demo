from typing import Any

DOCAI_ENDPOINT = "https://us-documentai.googleapis.com/v1/projects/483471568825/locations/us/processors/eb841251e62f0062:process"
SUPPORTED_TYPES = {"income", "t4", "noa", "pay_stub", "employment_letter", "bank_statement"}
CONFIDENCE_THRESHOLD = 0.80

def docai_document_processors(document_base64: str, mime_type: str = "image/jpeg", document_type: str = "income") -> dict[str, Any]:
    """
    Calls DocAI processDocument for income verification documents.
    document_type: income | t4 | noa | pay_stub | employment_letter | bank_statement
Processing may take several seconds. If a pacing phrase is needed, deliver it from the agent instruction before calling this tool.
"""
    if not document_base64:
        return {"status": "validation_error", "code": "MISSING_DOCUMENT", "data": {}}

    doc_type = document_type.lower() if document_type else "income"
    if doc_type not in SUPPORTED_TYPES:
        return {"status": "validation_error", "code": "UNSUPPORTED_DOCUMENT_TYPE", "data": {"supportedTypes": list(SUPPORTED_TYPES)}}

    # Stub: realistic income document extraction
    if doc_type in {"t4", "income"}:
        extracted = {
            "documentType": "T4",
            "taxYear": "2025",
            "employerName": "Accenture Inc.",
            "employerBIN": "123456789",
            "employeesSIN": "[REMOVED]",
            "box14Employment": 95000.00,
            "box16CPP": 3500.00,
            "box18EI": 1049.12,
            "box22IncomeTax": 18500.00,
            "confidence": 0.94
        }
    elif doc_type == "noa":
        extracted = {
            "documentType": "NOA",
            "taxYear": "2024",
            "totalIncome": 98500.00,
            "taxableIncome": 95200.00,
            "federalTaxOwing": 16800.00,
            "assessmentDate": "2025-04-15",
            "confidence": 0.92
        }
    else:
        extracted = {
            "documentType": doc_type.upper(),
            "grossPay": 7916.67,
            "netPay": 5850.00,
            "payPeriod": "monthly",
            "annualizedIncome": 95000.00,
            "employer": "Demo Employer Ltd.",
            "payDate": "2026-09-15",
            "confidence": 0.91
        }

    manual_review = extracted.get("confidence", 1.0) < CONFIDENCE_THRESHOLD

    return {
        "status": "success",
        "data": {
            "documentType": doc_type,
            "extractedData": extracted,
            "manualReviewRequired": manual_review,
            "overallConfidence": extracted.get("confidence", 0.91),
            "mimeType": mime_type,
            "pageCount": 1
        }
    }

# agent_action: "An unexpected error occurred — please inform the customer and try again."
