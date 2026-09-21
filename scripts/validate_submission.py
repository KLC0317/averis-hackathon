"""Strict local validation for an organizer submission JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "cleardraft-agent-handoff" / "cleardraft-agent-handoff" / "SUBMISSION_SCHEMA.json"
PUBLIC_ROOT = ROOT / "sdoc-hackathon-bundle"
ALLOWED_CATEGORIES = {"BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"}
ALLOWED_STATUS = {"OK", "MISMATCH", "NEEDS_REVIEW"}
ALLOWED_REASONS = {None, "wrong_doc_type", "missing_attachment", "unreadable", "missing_value"}
FIELDS = {"shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge", "container_count", "gross_weight_kg"}
REQUIRED = {"category", "status", "review_reason", "has_defect", "defect_fields"}


def known_ids(root: Path = PUBLIC_ROOT) -> set[str]:
    ids: set[str] = set()
    for path in sorted((root / "inbox").glob("*.json")):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(value, dict) and isinstance(value.get("email_id"), str):
                ids.add(value["email_id"])
        except (OSError, UnicodeError, json.JSONDecodeError):
            pass
    return ids


def validate(payload: object, ids: set[str] | None = None) -> list[str]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return ["submission must be a top-level object"]
    if ids is None:
        ids = known_ids()
    missing = ids - payload.keys()
    extra = payload.keys() - ids
    if missing:
        errors.append(f"missing email IDs: {sorted(missing)[:5]}")
    if extra:
        errors.append(f"unknown email IDs: {sorted(extra)[:5]}")
    for email_id, entry in payload.items():
        if not isinstance(entry, dict):
            errors.append(f"{email_id}: entry must be an object")
            continue
        if set(entry) != REQUIRED:
            errors.append(f"{email_id}: entry keys must be exactly {sorted(REQUIRED)}")
            continue
        category, status = entry["category"], entry["status"]
        reason, defect, fields = entry["review_reason"], entry["has_defect"], entry["defect_fields"]
        if category not in ALLOWED_CATEGORIES:
            errors.append(f"{email_id}: invalid category")
        if status not in ALLOWED_STATUS:
            errors.append(f"{email_id}: invalid status")
        if reason not in ALLOWED_REASONS:
            errors.append(f"{email_id}: invalid review_reason")
        if not isinstance(defect, bool):
            errors.append(f"{email_id}: has_defect must be boolean")
        if not isinstance(fields, list) or len(set(fields)) != len(fields) or any(field not in FIELDS for field in fields):
            errors.append(f"{email_id}: defect_fields must be a unique list of known fields")
        if status == "OK" and (reason is not None or defect is not False or fields):
            errors.append(f"{email_id}: OK requires null reason, false defect, empty fields")
        if status == "MISMATCH" and (category != "BL_COMPARISON" or reason is not None or defect is not True or not fields):
            errors.append(f"{email_id}: MISMATCH requires comparison, null reason, true defect, non-empty fields")
        if status == "NEEDS_REVIEW" and (category != "BL_COMPARISON" or reason is None or defect is not False or fields):
            errors.append(f"{email_id}: NEEDS_REVIEW requires comparison, reason, false defect, empty fields")
        if category != "BL_COMPARISON" and status != "OK":
            errors.append(f"{email_id}: non-comparison category must have OK status")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("submission", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.submission.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"invalid JSON: {exc}", file=sys.stderr)
        return 2
    errors = validate(payload)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"valid submission: {len(payload)} email records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

