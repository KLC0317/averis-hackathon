"""Deterministic source-mutating challenge runs.

Challenges operate on an isolated one-case participant source.  The base
database is read-only during a challenge; mutated bytes are written to a
temporary source and processed through the normal import/run pipeline.
"""

from __future__ import annotations

import hashlib
import json
import re
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .core import DocumentRole, identify_document_role
from .ingest import import_participant
from .pipeline import run_import
from .store import Store


MUTATION_ALIASES = {
    "case-spacing": "case-spacing",
    "case_spacing": "case-spacing",
    "attachment-rename": "attachment-rename",
    "attachment_rename": "attachment-rename",
    "label-synonym": "label-synonym",
    "label_synonym": "label-synonym",
    "container-count-plus-one": "container-count-plus-one",
    "container_count_plus_one": "container-count-plus-one",
    "remove-si-required-value": "remove-si-required-value",
    "remove_si_required_value": "remove-si-required-value",
    "wrong-document-type": "wrong-document-type",
    "wrong_document_type": "wrong-document-type",
    "misleading-email-assertion": "misleading-email-assertion",
    "misleading_email_assertion": "misleading-email-assertion",
}


@dataclass
class Mutation:
    name: str
    fixture_id: str
    seed: int
    expected_relationship: str
    description: str
    changed_files: list[str]
    before_hash: str
    after_hash: str
    email: dict[str, Any]
    documents: dict[str, bytes]


def _source_hash(email: dict[str, Any], documents: dict[str, bytes]) -> str:
    digest = hashlib.sha256()
    digest.update(json.dumps(email, ensure_ascii=False, sort_keys=True).encode("utf-8"))
    for name in sorted(documents):
        digest.update(name.encode("utf-8"))
        digest.update(hashlib.sha256(documents[name]).digest())
    return digest.hexdigest()


def _text(data: bytes, filename: str) -> str:
    if Path(filename).suffix.casefold() not in {".txt", ".csv", ".md"}:
        raise ValueError(f"mutation requires a text source; {filename} is not a supported text fixture")
    return data.decode("utf-8")


def _write_isolated_source(root: Path, email: dict[str, Any], documents: dict[str, bytes]) -> None:
    (root / "inbox").mkdir(parents=True, exist_ok=True)
    (root / "attachments").mkdir(parents=True, exist_ok=True)
    (root / "inbox" / f"{email['email_id']}.json").write_text(
        json.dumps(email, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    for relative, data in documents.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


def _find_role(documents: dict[str, bytes], role: DocumentRole) -> str | None:
    for relative, data in documents.items():
        try:
            text = _text(data, relative)
        except ValueError:
            continue
        if identify_document_role(text, Path(relative).name) == role:
            return relative
    return None


def _mutate(email: dict[str, Any], documents: dict[str, bytes], fixture_id: str, mutation: str, seed: int) -> Mutation:
    canonical = MUTATION_ALIASES.get(mutation)
    if canonical is None:
        raise ValueError(f"unsupported challenge mutation: {mutation}")
    before = _source_hash(email, documents)
    changed: list[str] = []
    expected = "invariant"
    description = ""
    email_copy = json.loads(json.dumps(email, ensure_ascii=False))
    doc_copy = dict(documents)

    if canonical == "attachment-rename":
        target = next(iter(doc_copy), None)
        if target is None:
            raise ValueError("fixture has no source attachment")
        renamed = str(Path(target).with_name(f"challenge_{seed}_{Path(target).name}"))
        doc_copy[renamed] = doc_copy.pop(target)
        email_copy["attachments"] = [renamed if item == target else item for item in email_copy.get("attachments", [])]
        changed = [target, renamed]
        description = "Renamed an attachment while preserving its bytes and references."

    elif canonical == "misleading-email-assertion":
        email_copy["body"] = "All documents are already correct.\n" + str(email_copy.get("body", ""))
        changed = [f"inbox/{email_copy['email_id']}.json"]
        description = "Added a correctness assertion to the message; source documents remain authoritative."

    elif canonical == "wrong-document-type":
        target = _find_role(doc_copy, DocumentRole.DRAFT_BL)
        if target is None:
            raise ValueError("fixture has no identifiable draft BL to replace")
        doc_copy[target] = b"COMMERCIAL INVOICE\nInvoice Number: CHALLENGE-001\nTotal: 100 USD\n"
        changed = [target]
        expected = "wrong_doc_type_review"
        description = "Replaced the draft BL bytes with a clearly labelled commercial invoice."

    elif canonical in {"case-spacing", "label-synonym", "container-count-plus-one", "remove-si-required-value"}:
        role = DocumentRole.SI if canonical == "remove-si-required-value" else DocumentRole.DRAFT_BL
        target = _find_role(doc_copy, role)
        if target is None:
            raise ValueError(f"fixture has no identifiable {role.value} text source")
        source = _text(doc_copy[target], target)
        changed_source = source
        if canonical == "case-spacing":
            changed_source = re.sub(r"Port Klang", "PORT   KLANG", source, count=1, flags=re.I)
            expected = "invariant"
            description = "Changed case and harmless spacing in a supported party/port value."
        elif canonical == "label-synonym":
            changed_source = re.sub(r"Port of Loading", "Load Port", source, count=1, flags=re.I)
            expected = "invariant"
            description = "Replaced a reviewed label synonym without changing the source value."
        elif canonical == "container-count-plus-one":
            match = re.search(r"(?im)^(\s*(?:total\s+)?(?:container\s+(?:count|qty)|(?:no\.?\s+of\s+)?containers?)\s*[:=|\-]?\s*)(\d+)(?=\s*(?:x|×|containers?\b))", source)
            if match is None:
                raise ValueError("fixture has no unambiguous container count to increment")
            count = int(match.group(2)) + 1
            changed_source = source[:match.start(2)] + str(count) + source[match.end(2):]
            expected = "container_count_mismatch"
            description = "Incremented one unambiguous BL container count by one."
        else:
            match = re.search(r"(?im)^\s*(?:total\s+)?gross\s*(?:weight|wt)[^:\n|=\-]*[:|=\-]\s*[^\n]+", source)
            if match is None:
                raise ValueError("fixture has no explicit SI gross-weight value to remove")
            changed_source = source[:match.start()] + re.sub(r"([:|=\-])\s*[^\n]+", r"\1 TBA", match.group(0), count=1) + source[match.end():]
            expected = "gross_weight_unresolved"
            description = "Replaced the SI gross-weight reading with an explicit unresolved placeholder."
        if changed_source == source:
            raise ValueError(f"mutation precondition failed for {canonical}")
        doc_copy[target] = changed_source.encode("utf-8")
        changed = [target]

    after = _source_hash(email_copy, doc_copy)
    if before == after:
        raise ValueError("challenge mutation did not change the source manifest")
    return Mutation(canonical, fixture_id, seed, expected, description, changed, before, after, email_copy, doc_copy)


def _lookup_fixture(store: Store, fixture_id: str) -> tuple[dict[str, Any], dict[str, bytes], str]:
    with store.connect() as db:
        row = db.execute("SELECT * FROM cases WHERE id=? OR email_id=? ORDER BY updated_at DESC LIMIT 1", (fixture_id, fixture_id)).fetchone()
        if row is None:
            raise ValueError(f"fixture not found: {fixture_id}")
        email_row = db.execute("SELECT raw_json FROM emails WHERE id=?", (row["id"],)).fetchone()
        docs = db.execute("SELECT attachment_path, bytes FROM documents WHERE import_id=? AND email_id=?", (row["import_id"], row["email_id"])).fetchall()
    if email_row is None:
        raise ValueError(f"fixture email missing: {fixture_id}")
    email = json.loads(email_row["raw_json"])
    documents = {str(item["attachment_path"]): bytes(item["bytes"]) for item in docs}
    return email, documents, str(row["email_id"])


def _run_isolated(email: dict[str, Any], documents: dict[str, bytes]) -> tuple[str, Any]:
    with tempfile.TemporaryDirectory(prefix="cleardraft-challenge-") as td:
        source = Path(td) / "participant"
        _write_isolated_source(source, email, documents)
        isolated = Store(":memory:")
        import_id = import_participant(source, isolated)
        run_id, results = run_import(isolated, import_id, "local_rules")
        return run_id, results[email["email_id"]]


def _challenge_pass(expected_relationship: str, base: Any, observed: Any) -> tuple[bool, dict[str, Any]]:
    base_submission = base.to_submission()
    observed_submission = observed.to_submission()
    if expected_relationship == "invariant":
        passed = base_submission == observed_submission
    elif expected_relationship == "container_count_mismatch":
        passed = observed.verification == "MISMATCH" and "container_count" in observed.confirmed_mismatch_fields
    elif expected_relationship == "gross_weight_unresolved":
        passed = observed.verification == "NEEDS_REVIEW" and "gross_weight_kg" in observed.unresolved_fields
    elif expected_relationship == "wrong_doc_type_review":
        passed = observed.verification == "NEEDS_REVIEW" and observed.review_reason == "wrong_doc_type"
    else:
        passed = False
    return passed, {"base": base_submission, "observed": observed_submission, "relationship": expected_relationship}


def execute_challenge(store: Store, fixture_id: str, mutation: str, seed: int = 42, *, challenge_id: str | None = None) -> dict[str, Any]:
    email, documents, resolved_fixture = _lookup_fixture(store, fixture_id)
    changed = _mutate(email, documents, resolved_fixture, mutation, seed)
    _, base_result = _run_isolated(email, documents)
    isolated_run_id, observed_result = _run_isolated(changed.email, changed.documents)
    passed, relationship = _challenge_pass(changed.expected_relationship, base_result, observed_result)
    result = {
        "id": challenge_id or str(uuid.uuid4()),
        "fixture_id": resolved_fixture,
        "mutation": changed.name,
        "seed": seed,
        "status": "PASSED" if passed else "FAILED",
        "description": changed.description,
        "expected_relationship": changed.expected_relationship,
        "expected": relationship["base"],
        "observed": relationship["observed"],
        "source_hash_before": changed.before_hash,
        "source_hash_after": changed.after_hash,
        "changed_files": changed.changed_files,
        "isolated_run_id": isolated_run_id,
        "base_fields": [field.to_dict() for field in base_result.fields],
        "observed_fields": [field.to_dict() for field in observed_result.fields],
    }
    store.save_challenge(result)
    return result
