import json
from pathlib import Path

from cleardraft.challenges import execute_challenge
from cleardraft.ingest import import_participant
from cleardraft.pipeline import run_import
from cleardraft.store import Store


def _fixture(root: Path) -> None:
    (root / "inbox").mkdir(parents=True)
    (root / "attachments").mkdir()
    si = """SHIPPING INSTRUCTION
Shipper: Sender Co
Consignee: Receiver Co
Notify Party: Receiver Co
Port of Loading: Port Klang
Port of Discharge: Karachi
Total Containers: 1 x 40HC
Gross Weight: 100 KG
"""
    bl = si.replace("SHIPPING INSTRUCTION", "DRAFT BILL OF LADING")
    (root / "attachments" / "email_001_SI.txt").write_text(si, encoding="utf-8")
    (root / "attachments" / "email_001_BL.txt").write_text(bl, encoding="utf-8")
    (root / "inbox" / "email_001.json").write_text(json.dumps({
        "email_id": "email_001", "from": "ops@example.com", "subject": "Compare SI and draft BL",
        "body": "Please compare the attached documents.",
        "attachments": ["attachments/email_001_SI.txt", "attachments/email_001_BL.txt"],
    }), encoding="utf-8")


def test_challenge_mutates_real_bytes_and_keeps_invariant_mutations(tmp_path: Path):
    root = tmp_path / "participant"
    _fixture(root)
    store = Store(tmp_path / "db.sqlite")
    import_id = import_participant(root, store)
    run_import(store, import_id)

    changed = execute_challenge(store, "email_001", "container-count-plus-one", seed=7)
    assert changed["status"] == "PASSED"
    assert changed["source_hash_before"] != changed["source_hash_after"]
    assert changed["observed"]["defect_fields"] == ["container_count"]

    invariant = execute_challenge(store, "email_001", "label-synonym", seed=7)
    assert invariant["status"] == "PASSED"
    assert invariant["observed"] == invariant["expected"]
