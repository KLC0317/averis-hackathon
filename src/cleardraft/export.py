"""Strict submission projection and validation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .core import CATEGORIES, FIELDS, REVIEW_REASONS
from .store import Store

STATUSES = ("OK", "MISMATCH", "NEEDS_REVIEW")
ENTRY_KEYS = {"category", "status", "review_reason", "has_defect", "defect_fields"}


def validate_submission(submission: dict[str, Any], known_email_ids: list[str] | set[str]) -> None:
    if not isinstance(submission, dict) or not submission:
        raise ValueError("submission must be a non-empty object")
    expected = set(known_email_ids)
    actual = set(submission)
    missing, extra = expected - actual, actual - expected
    if missing: raise ValueError(f"submission missing email IDs: {', '.join(sorted(missing)[:5])}")
    if extra: raise ValueError(f"submission contains unknown email IDs: {', '.join(sorted(extra)[:5])}")
    for eid in sorted(submission):
        item = submission[eid]
        if not isinstance(item, dict) or set(item) != ENTRY_KEYS:
            raise ValueError(f"{eid}: entry must contain exactly {sorted(ENTRY_KEYS)}")
        category, status = item["category"], item["status"]
        if category not in CATEGORIES: raise ValueError(f"{eid}: invalid category")
        if status not in STATUSES: raise ValueError(f"{eid}: invalid status")
        reason = item["review_reason"]
        if reason is not None and reason not in REVIEW_REASONS: raise ValueError(f"{eid}: invalid review_reason")
        fields = item["defect_fields"]
        if not isinstance(item["has_defect"], bool) or not isinstance(fields, list) or len(set(fields)) != len(fields):
            raise ValueError(f"{eid}: malformed defect fields")
        if any(f not in FIELDS for f in fields): raise ValueError(f"{eid}: unknown defect field")
        if status == "OK" and (reason is not None or item["has_defect"] or fields):
            raise ValueError(f"{eid}: OK must have no reason or defect")
        if status == "MISMATCH" and (category != "BL_COMPARISON" or reason is not None or not item["has_defect"] or not fields):
            raise ValueError(f"{eid}: MISMATCH requires BL_COMPARISON and defect fields")
        if status == "NEEDS_REVIEW" and (category != "BL_COMPARISON" or reason not in REVIEW_REASONS or item["has_defect"] or fields):
            raise ValueError(f"{eid}: NEEDS_REVIEW requires a supported reason and no defect fields")
        if category != "BL_COMPARISON" and status != "OK":
            raise ValueError(f"{eid}: non-comparison categories must be OK")


def export_run(store: Store, run_id: str, out: str | Path, *, machine_only: bool = True) -> dict[str, Any]:
    with store.connect() as db:
        row = db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        if not row: raise ValueError(f"run not found: {run_id}")
        payload = json.loads(row["result_json"] or "{}")
        email_rows = db.execute("SELECT email_id FROM emails WHERE import_id=? ORDER BY email_id", (row["import_id"],)).fetchall()
    known = [r["email_id"] for r in email_rows]
    validate_submission(payload, known)
    # Stable ordering and UTF-8 output make hashes reproducible.
    ordered = {eid: payload[eid] for eid in sorted(payload)}
    path = Path(out); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return ordered


def load_and_validate(path: str | Path, known_email_ids: list[str] | set[str]) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    validate_submission(payload, known_email_ids)
    return payload

