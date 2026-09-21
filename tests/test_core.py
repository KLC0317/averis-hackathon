from cleardraft.core import (
    DocumentRole, FieldObservation, ValueStatus, classify_email,
    compare_documents, extract_fields, identify_document_role, normalize_field,
)


def fixture(role="SI", *, consignee="ACME LTD", weight="1,234 KG"):
    return f"""SHIPPING INSTRUCTION\nShipper: Sender Co\nConsignee: {consignee}\nNotify Party: ACME LTD\nPort of Loading: Port Klang, Malaysia\nPort of Discharge: Karachi, Pakistan\nTotal Containers: 6 x 40'HC\nGross Wt (kgs): {weight}\n"""


def test_independent_extraction_and_semantic_normalization():
    si = extract_fields(fixture(), DocumentRole.SI)
    bl = extract_fields(fixture().replace("Port of Loading", "Load Port"), DocumentRole.DRAFT_BL)
    assert si["container_count"].canonical_value == "6"
    assert si["gross_weight_kg"].canonical_value == "1234"
    assert si["port_of_loading"].canonical_value == bl["port_of_loading"].canonical_value


def test_missing_is_unresolved_and_never_zero():
    si = extract_fields(fixture(), DocumentRole.SI)
    bl = extract_fields(fixture().replace("Gross Wt (kgs): 1,234 KG", "Gross Wt (kgs): TBA"), DocumentRole.DRAFT_BL)
    result = compare_documents(si, bl)
    assert result.verification == "NEEDS_REVIEW"
    assert "gross_weight_kg" in result.unresolved_fields
    assert result.to_submission()["status"] == "NEEDS_REVIEW"


def test_reliable_difference_is_exact_field():
    si = extract_fields(fixture(), DocumentRole.SI)
    bl = extract_fields(fixture().replace("Consignee: ACME LTD", "Consignee: OTHER CO"), DocumentRole.DRAFT_BL)
    result = compare_documents(si, bl)
    assert result.verification == "MISMATCH"
    assert result.confirmed_mismatch_fields == ["consignee"]
    assert result.to_submission()["defect_fields"] == ["consignee"]


def test_classifier_uses_message_language():
    assert classify_email("Please compare draft BL", "Check consignee against SI") ["category"] == "BL_COMPARISON"
    assert classify_email("Invoice query", "Please send invoice copy")["category"] == "INVOICE_QUERY"
    assert classify_email("Hello", "Can we meet tomorrow?")["requires_review"] is True


def test_numeric_boundaries():
    assert normalize_field("container_count", "6 x 40'HC")[0] == "6"
    assert normalize_field("gross_weight_kg", "2 tonnes")[0] == "2000"
    assert normalize_field("gross_weight_kg", "100 lb")[0] is None


def test_document_layout_markers_are_normalized_without_inventing_weight():
    text = """BILL OF LADING (DRAFT)
Shipper (???) | Example Export Co.
Consignee
Buyer Co.
To the Order of | Buyer Co.
Notify Party (???) | Buyer Co.
Port of Loading (POL)
Port Klang
Port of Discharge (POD) | Rotterdam
No. of Containers
6 x 40HC
GROSS WEIGHT (?? KGS) | 22,000
"""
    fields = extract_fields(text, DocumentRole.DRAFT_BL)
    assert fields["shipper"].canonical_value == "example export co."
    assert fields["consignee"].canonical_value == "buyer co."
    assert fields["container_count"].canonical_value == "6"
    assert fields["gross_weight_kg"].canonical_value == "22000"

    # A table header followed by a container identifier is not a weight. The
    # parser leaves it unresolved rather than borrowing the numeric suffix.
    ambiguous = "GROSS WEIGHT (KG)\nContainer ABC123\nNet Weight: 22000 KG\n"
    assert extract_fields(ambiguous, DocumentRole.DRAFT_BL)["gross_weight_kg"].value_status == ValueStatus.MISSING
    # Unrecognized OCR noise is intentionally left for review instead of
    # gaining a fixture-specific alias.
    noisy = "GROSS WEIGHTII(KGS): 22000 KG\n"
    assert extract_fields(noisy, DocumentRole.DRAFT_BL)["gross_weight_kg"].value_status == ValueStatus.MISSING


def test_optional_label_qualifier_is_general_and_business_parentheses_are_preserved():
    fields = extract_fields("Load Port (POL): Port Klang\n", DocumentRole.DRAFT_BL)
    assert fields["port_of_loading"].canonical_value == "klang"
    fields = extract_fields("Consignee: (ACME) Terminal\n", DocumentRole.DRAFT_BL)
    assert fields["consignee"].canonical_value == "(acme) terminal"


def test_document_role_heading_variants_are_content_based():
    assert identify_document_role("BL INSTRUCTION\nShipper: Example Co") == DocumentRole.SI
    assert identify_document_role("BILL OF LADING INSTRUCTION\nShipper: Example Co") == DocumentRole.SI
    assert identify_document_role("BILL OF LADING (DRAFT)\nShipper: Example Co") == DocumentRole.DRAFT_BL
    assert identify_document_role("COMMERCIAL INVOICE\nInvoice Number: 123\nNot a shipping instruction") == DocumentRole.OTHER
