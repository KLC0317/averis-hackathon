"""Make the handoff acceptance matrix executable as a release input."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HANDOFF = ROOT / "cleardraft-agent-handoff" / "cleardraft-agent-handoff"


def test_acceptance_scenarios_have_stable_ids_and_layers() -> None:
    payload = json.loads((HANDOFF / "ACCEPTANCE_TESTS.json").read_text(encoding="utf-8"))
    scenarios = payload["tests"]
    ids = [item["id"] for item in scenarios]
    assert len(ids) >= 70
    assert len(ids) == len(set(ids))
    assert all(item.get("priority") in {"P0", "P1", "P2"} for item in scenarios)
    assert all(item.get("layer") for item in scenarios)
    assert all(item.get("status") in {"not_implemented", "implemented", "partial"} for item in scenarios)


def test_submission_schema_matches_documented_enums() -> None:
    schema = json.loads((HANDOFF / "SUBMISSION_SCHEMA.json").read_text(encoding="utf-8"))
    entry = schema["additionalProperties"]
    assert set(entry["required"]) == {"category", "status", "review_reason", "has_defect", "defect_fields"}
    assert set(entry["properties"]["category"]["enum"]) == {"BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"}
    assert set(entry["properties"]["status"]["enum"]) == {"OK", "MISMATCH", "NEEDS_REVIEW"}

