from __future__ import annotations

import io
import json
from pathlib import Path

import pytest

from cleardraft.ingest import import_participant
from cleardraft.pipeline import run_import
from cleardraft.readers import read_document
from cleardraft.store import Store


def _bundle(root: Path) -> Path:
    (root / "inbox").mkdir(parents=True)
    (root / "attachments").mkdir()
    si = """SHIPPING INSTRUCTION
Shipper: Sender Co
Consignee: Receiver Co
Notify Party: Receiver Co
Port of Loading: Port Klang
Port of Discharge: Karachi
Container Count: 1 x 40HC
Gross Weight: 100 KG
"""
    bl = si.replace("SHIPPING INSTRUCTION", "DRAFT BILL OF LADING")
    (root / "attachments" / "case_SI.txt").write_text(si, encoding="utf-8")
    (root / "attachments" / "case_BL.txt").write_text(bl, encoding="utf-8")
    (root / "inbox" / "email_001.json").write_text(json.dumps({
        "email_id": "email_001", "from": "ops@example.test",
        "subject": "Compare SI and draft BL",
        "body": "Please compare the attached documents.",
        "attachments": ["attachments/case_SI.txt", "attachments/case_BL.txt"],
    }), encoding="utf-8")
    return root


def test_readers_return_evidence_and_visible_failures() -> None:
    txt = read_document(b"Shipper: Example\n", "source.txt")
    assert txt.detected_format == "txt"
    assert txt.blocks[0].locator["start_line"] == 1

    corrupt_pdf = read_document(b"%PDF-not-a-valid-document", "source.pdf")
    assert corrupt_pdf.detected_format == "pdf"
    assert corrupt_pdf.error or corrupt_pdf.warnings


def test_identical_import_is_idempotent(tmp_path: Path) -> None:
    root = _bundle(tmp_path / "participant")
    store = Store(tmp_path / "db.sqlite")
    first = import_participant(root, store)
    second = import_participant(root, store)
    assert second == first
    with store.connect() as db:
        assert db.execute("SELECT COUNT(*) AS n FROM imports").fetchone()["n"] == 1
        assert db.execute("SELECT COUNT(*) AS n FROM emails").fetchone()["n"] == 1


def test_replay_fails_closed_until_hash_checked_fixture_exists(tmp_path: Path) -> None:
    store = Store(tmp_path / "db.sqlite")
    with pytest.raises(ValueError, match="hash-checked recorded run"):
        run_import(store, "missing-import", "replay")


def test_revision_upload_advances_case_version_and_rejects_stale_upload(tmp_path: Path) -> None:
    fastapi_testclient = pytest.importorskip("fastapi.testclient")
    from cleardraft.api import create_app

    store = Store(tmp_path / "db.sqlite")
    import_id = import_participant(_bundle(tmp_path / "participant"), store)
    run_import(store, import_id)
    case = store.list_cases(import_id)[0]
    client = fastapi_testclient.TestClient(create_app(str(tmp_path / "db.sqlite")))
    replacement = b"SHIPPING INSTRUCTION\nShipper: Revised Co\n"
    response = client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("revision.txt", replacement, "text/plain")},
        data={"expected_version": str(case["version"]), "role_hint": "SI"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["case_version"] == case["version"] + 1

    stale = client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("stale.txt", b"later", "text/plain")},
        data={"expected_version": str(case["version"]), "role_hint": "SI"},
    )
    assert stale.status_code == 409


def test_report_contains_provenance_and_truthful_pending_claims(tmp_path: Path) -> None:
    from cleardraft.__main__ import command_report
    import argparse

    store = Store(tmp_path / "db.sqlite")
    import_id = import_participant(_bundle(tmp_path / "participant"), store)
    run_id, _ = run_import(store, import_id)
    output = tmp_path / "report.json"
    assert command_report(argparse.Namespace(db=str(tmp_path / "db.sqlite"), run_id=run_id, out=str(output))) == 0
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["artifact_type"] == "cleardraft_run_report"
    assert report["input_hash"]
    assert report["import_manifest_hash"]
    assert report["claims"]["organizer_score"] is None
    assert report["claims"]["human_study"] == "not_run"
