"""Resolving an arbitration must take effect, not merely be recorded."""

import json

import pytest

from cleardraft.api import create_app
from cleardraft.ingest import import_participant
from cleardraft.pipeline import run_import
from cleardraft.store import Store

fastapi_testclient = pytest.importorskip("fastapi.testclient")


def _bundle(tmp_path):
    """A two-message inbox: one comparison pair, one deliberately ambiguous."""
    inbox = tmp_path / "inbox"
    attachments = tmp_path / "attachments"
    inbox.mkdir(parents=True)
    attachments.mkdir(parents=True)
    si = ("SHIPPING INSTRUCTION\nShipper: Alpha Trading\nConsignee: Beta Imports\n"
          "Notify Party: Beta Imports\nPort of Loading: Singapore\nPort of Discharge: Rotterdam\n"
          "Container Count: 2\nGross Weight (KG): 1000 KG\n")
    bl = ("BILL OF LADING\nShipper: Alpha Trading\nConsignee: Beta Imports\n"
          "Notify Party: Beta Imports\nPort of Loading: Singapore\nPort of Discharge: Rotterdam\n"
          "Container Count: 2\nGross Weight (KG): 1000 KG\n")
    (attachments / "email_900_SI.txt").write_text(si, encoding="utf-8")
    (attachments / "email_900_BL.txt").write_text(bl, encoding="utf-8")
    (inbox / "email_900.json").write_text(json.dumps({
        "email_id": "email_900",
        "from": "ops@example.test",
        "subject": "Shipping instruction enclosed",
        "body": "Please find shipping instruction attached. Kindly revert with draft BL for checking.",
        "attachments": ["attachments/email_900_SI.txt", "attachments/email_900_BL.txt"],
    }), encoding="utf-8")
    return tmp_path


def test_resolution_reclassifies_and_runs_the_comparison(tmp_path):
    db = str(tmp_path / "db.sqlite")
    store = Store(db)
    import_id = import_participant(str(_bundle(tmp_path / "bundle")), store)
    run_import(store, import_id, "local_rules")

    case = store.list_cases(import_id)[0]
    classification = json.loads(case["classification_json"])
    gateway = classification["gateway"]
    # The message deliberately reads as both an SI submission and a draft
    # request, so it should not have been auto-accepted.
    assert gateway["needs_human"] is True
    packet = gateway["arbitration"]
    assert packet is not None and len(packet["options"]) >= 1

    client = fastapi_testclient.TestClient(create_app(db))
    response = client.post(
        f"/cases/{case['id']}/arbitration",
        json={"category": "BL_COMPARISON", "expected_case_version": case["version"],
              "resolved_by": "tester", "note": "operator confirmed a comparison request"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["category"] == "BL_COMPARISON"
    # The documents match, so honouring the choice must produce a real comparison
    # rather than leaving the case parked as not-applicable.
    assert response.json()["verification"] == "MATCH"

    stored = store.get_case(case["id"])["classification"]
    assert stored["category"] == "BL_COMPARISON"
    assert stored["source"] == "human"
    assert stored["gateway"]["needs_human"] is False
    assert stored["gateway"]["resolved"]["by"] == "tester"
    events = store.list_review_events(case["id"])
    assert any(e["action"] == "resolve_classification" for e in events)


def test_a_category_that_was_never_offered_is_rejected(tmp_path):
    db = str(tmp_path / "db.sqlite")
    store = Store(db)
    import_id = import_participant(str(_bundle(tmp_path / "bundle")), store)
    run_import(store, import_id, "local_rules")
    case = store.list_cases(import_id)[0]

    client = fastapi_testclient.TestClient(create_app(db))
    response = client.post(
        f"/cases/{case['id']}/arbitration",
        json={"category": "SPAM", "expected_case_version": case["version"]},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "category_not_offered"


def test_a_stale_case_version_is_refused(tmp_path):
    db = str(tmp_path / "db.sqlite")
    store = Store(db)
    import_id = import_participant(str(_bundle(tmp_path / "bundle")), store)
    run_import(store, import_id, "local_rules")
    case = store.list_cases(import_id)[0]

    client = fastapi_testclient.TestClient(create_app(db))
    response = client.post(
        f"/cases/{case['id']}/arbitration",
        json={"category": "BL_COMPARISON", "expected_case_version": case["version"] + 5},
    )
    assert response.status_code == 409
