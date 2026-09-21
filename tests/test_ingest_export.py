import json
from pathlib import Path

import pytest

from cleardraft.export import validate_submission
from cleardraft.ingest import safe_relative


def test_safe_relative_rejects_traversal():
    with pytest.raises(ValueError): safe_relative("../ground_truth.json")
    with pytest.raises(ValueError): safe_relative("C:/secret.txt")


def test_submission_cross_field_validation():
    base = {"email_001": {"category": "BL_COMPARISON", "status": "MISMATCH", "review_reason": None,
                           "has_defect": True, "defect_fields": ["consignee"]}}
    validate_submission(base, ["email_001"])
    base["email_001"]["has_defect"] = False
    with pytest.raises(ValueError): validate_submission(base, ["email_001"])

