import json
from pathlib import Path

from cleardraft.export import export_run
from cleardraft.ingest import import_participant
from cleardraft.pipeline import run_import
from cleardraft.store import Store


def test_import_run_export_round_trip(tmp_path: Path):
    root = tmp_path / "participant"
    (root / "inbox").mkdir(parents=True)
    (root / "attachments").mkdir()
    si = """SHIPPING INSTRUCTION\nShipper: Sender Co\nConsignee: Receiver Co\nNotify Party: Receiver Co\nPort of Loading: Port Klang\nPort of Discharge: Karachi\nTotal Containers: 1 x 40'HC\nGross Weight: 100 KG\n"""
    bl = si.replace("SHIPPING INSTRUCTION", "DRAFT BILL OF LADING")
    (root / "attachments" / "email_001_SI.txt").write_text(si)
    (root / "attachments" / "email_001_BL.txt").write_text(bl)
    (root / "inbox" / "email_001.json").write_text(json.dumps({
        "email_id": "email_001", "from": "ops@example.com", "subject": "Please compare SI and draft BL",
        "body": "Please compare the attached SI and draft BL.", "attachments": ["attachments/email_001_SI.txt", "attachments/email_001_BL.txt"]
    }))
    store = Store(tmp_path / "db.sqlite")
    import_id = import_participant(root, store)
    run_id, results = run_import(store, import_id)
    assert results["email_001"].verification == "MATCH"
    payload = export_run(store, run_id, tmp_path / "submission.json")
    assert payload["email_001"]["status"] == "OK"

