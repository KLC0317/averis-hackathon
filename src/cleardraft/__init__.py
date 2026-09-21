"""ClearDraft core package.

The package intentionally keeps inference local and evidence backed.  Optional
AI providers are adapters around the same contracts and never participate in
comparison or export validation.
"""

from .core import (
    CATEGORIES,
    FIELDS,
    DocumentRole,
    ValueStatus,
    FieldState,
    FieldObservation,
    FieldResult,
    VerificationResult,
    classify_email,
    compare_documents,
    extract_fields,
    normalize_field,
    normalize_text,
    identify_document_role,
    aggregate_submission,
)

__all__ = [
    "CATEGORIES", "FIELDS", "DocumentRole", "ValueStatus", "FieldState",
    "FieldObservation", "FieldResult", "VerificationResult", "classify_email",
    "compare_documents", "extract_fields", "normalize_field", "normalize_text",
    "identify_document_role", "aggregate_submission",
]

__version__ = "0.1.0"
