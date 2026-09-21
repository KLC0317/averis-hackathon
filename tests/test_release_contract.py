"""Release-level invariants that do not depend on the private evaluator."""

from __future__ import annotations

import json
from pathlib import Path

from scripts.doctor import inspect_isolation, inspect_public_bundle
from scripts.validate_submission import validate


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "sdoc-hackathon-bundle"


def test_public_inventory_is_complete() -> None:
    checks = dict((name, ok) for name, ok, _ in inspect_public_bundle(PUBLIC))
    assert checks["participant root"]
    assert checks["inbox directory"]
    assert checks["attachments directory"]
    assert checks["inbox records"]
    assert checks["attachment files"]
    assert checks["supported formats"]


def test_evaluator_isolation_rules_are_present() -> None:
    checks = dict((name, ok) for name, ok, _ in inspect_isolation(ROOT))
    assert checks["git ignores answer key"]
    assert checks["docker ignores answer key"]
    assert checks["docker excludes source archives"]
    assert checks["app services do not mount evaluator key"]


def test_placeholder_template_is_not_an_application_result() -> None:
    template = json.loads((PUBLIC / "sample_submission.json").read_text(encoding="utf-8"))
    # The public template is shape-only. A loader must validate a complete
    # application result against known IDs, so an empty result is rejected.
    assert validate({}, ids=set(template))


def test_submission_projection_rules() -> None:
    ids = {"email_001", "email_002", "email_003", "email_004"}
    valid = {
        "email_001": {"category": "GENERAL", "status": "OK", "review_reason": None, "has_defect": False, "defect_fields": []},
        "email_002": {"category": "BL_COMPARISON", "status": "OK", "review_reason": None, "has_defect": False, "defect_fields": []},
        "email_003": {"category": "BL_COMPARISON", "status": "MISMATCH", "review_reason": None, "has_defect": True, "defect_fields": ["consignee"]},
        "email_004": {"category": "BL_COMPARISON", "status": "NEEDS_REVIEW", "review_reason": "missing_attachment", "has_defect": False, "defect_fields": []},
    }
    assert validate(valid, ids=ids) == []


def test_submission_rejects_false_clearance() -> None:
    ids = {"email_001"}
    false_clearance = {
        "email_001": {"category": "BL_COMPARISON", "status": "OK", "review_reason": None, "has_defect": True, "defect_fields": ["consignee"]}
    }
    assert validate(false_clearance, ids=ids)
