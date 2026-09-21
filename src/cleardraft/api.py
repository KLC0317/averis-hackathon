"""FastAPI adapter for imports, verification runs, review, and challenges."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .challenges import execute_challenge
from .core import ValueStatus, compare_documents, normalize_field
from .export import export_run
from .ingest import import_participant
from .pipeline import _obs_from_dict, _result_json, run_import, verify_case
from .readers import read_document
from .store import Store

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

try:
    from fastapi import FastAPI, File, Form, HTTPException, UploadFile
    from fastapi.responses import FileResponse, Response
except Exception:  # pragma: no cover - enables core-only installs
    FastAPI = None  # type: ignore


def _state(verification: str | None, processing: str | None, reason: str | None = None,
           classification_review: bool = False) -> str:
    if processing not in {"SUCCEEDED", "FAILED"}:
        return "Processing"
    # An unsettled category outranks the comparison outcome: if the routing is
    # wrong, the comparison underneath it was answering the wrong question.
    if classification_review:
        return "Needs classification review"
    if verification in {"MATCH", "NOT_APPLICABLE"}:
        return "Complete"
    if reason in {"missing_attachment", "wrong_doc_type"}:
        return "Awaiting source"
    if processing == "FAILED":
        return "Failed"
    return "Needs review"


def _case_payload(store: Store, value: dict[str, Any]) -> dict[str, Any]:
    case = dict(value)
    if "result" not in case and case.get("result_json"):
        case["result"] = json.loads(case["result_json"])
    if "classification" not in case and case.get("classification_json"):
        case["classification"] = json.loads(case["classification_json"])
    category = case.get("category") or (case.get("classification") or {}).get("category")
    result = case.get("result") or {}
    with store.connect() as db:
        email_row = db.execute("SELECT raw_json FROM emails WHERE id=?", (case["id"],)).fetchone()
        docs = db.execute("SELECT id,filename,format,sha256,size,created_at,attachment_path FROM documents WHERE import_id=? AND email_id=? ORDER BY attachment_path",
                          (case["import_id"], case["email_id"])).fetchall()
    email = json.loads(email_row["raw_json"]) if email_row else {}
    reason = result.get("review_reason")
    gateway = (case.get("classification") or {}).get("gateway") or {}
    classification_review = bool(gateway.get("needs_human"))
    if classification_review:
        next_action = "Confirm message category"
    elif reason in {"missing_attachment", "wrong_doc_type"}:
        next_action = "Request source document"
    elif result.get("unresolved_fields") or result.get("confirmed_mismatch_fields"):
        next_action = "Review findings"
    else:
        next_action = "No action required"
    case.update({
        "category": category,
        "result": result,
        "subject": email.get("subject", ""),
        "sender": email.get("from", ""),
        "received_at": email.get("received_at") or email.get("date"),
        "state": _state(case.get("verification"), case.get("processing"), reason, classification_review),
        "confirmed_differences": len(result.get("confirmed_mismatch_fields", [])),
        "unresolved_fields": len(result.get("unresolved_fields", [])),
        "next_action": next_action,
        "gateway": gateway,
        "documents": [dict(doc) for doc in docs],
    })
    return case


def create_app(db_path: str | None = None):
    if FastAPI is None:
        raise RuntimeError("fastapi is required for the API")
    app = FastAPI(title="ClearDraft API", version="0.2.0")
    configured = db_path or os.getenv("CLEARDRAFT_DB")
    database_url = os.getenv("DATABASE_URL", "")
    if not configured and database_url.startswith("sqlite:///"):
        configured = database_url.removeprefix("sqlite:///")
    store = Store(configured or "var/cleardraft.db")

    @app.get("/api/v1/health")
    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/v1/readiness")
    @app.get("/readiness")
    def readiness() -> dict[str, Any]:
        try:
            with store.connect() as db:
                db.execute("SELECT 1").fetchone()
            return {"ready": True, "database": True}
        except Exception as exc:
            return {"ready": False, "database": False, "error": type(exc).__name__}

    @app.post("/api/v1/imports", status_code=202)
    async def create_import(file: UploadFile = File(...)) -> dict[str, str]:
        if not file.filename or not file.filename.lower().endswith(".zip"):
            raise HTTPException(400, "participant ZIP required")
        with tempfile.TemporaryDirectory(prefix="cleardraft-") as td:
            path = Path(td) / "participant.zip"
            path.write_bytes(await file.read())
            try:
                iid = import_participant(path, store)
            except (ValueError, OSError) as exc:
                raise HTTPException(400, str(exc)) from exc
        return {"import_id": iid, "importId": iid, "status": "IMPORTED"}

    @app.get("/api/v1/imports")
    @app.get("/imports")
    def list_imports() -> list[dict[str, Any]]:
        with store.connect() as db:
            rows = db.execute("SELECT * FROM imports ORDER BY created_at DESC").fetchall()
        out = []
        for row in rows:
            value = dict(row)
            value["issues"] = json.loads(value.pop("issues_json") or "[]")
            out.append(value)
        return out

    @app.get("/api/v1/imports/{import_id}")
    @app.get("/imports/{import_id}")
    def get_import(import_id: str) -> dict[str, Any]:
        value = store.get_import(import_id)
        if not value:
            raise HTTPException(404, "import not found")
        value["latest_run"] = store.latest_run(import_id)
        return value

    @app.post("/api/v1/imports/{import_id}/runs", status_code=202)
    @app.post("/imports/{import_id}/runs", status_code=202)
    def create_run(import_id: str, body: dict[str, Any] | None = None) -> dict[str, str]:
        mode = (body or {}).get("mode", "local_rules")
        try:
            rid, _ = run_import(store, import_id, mode)
        except (ValueError, RuntimeError) as exc:
            raise HTTPException(400, str(exc)) from exc
        return {"run_id": rid, "runId": rid, "status": "SUCCEEDED"}

    @app.get("/api/v1/runs/{run_id}")
    @app.get("/runs/{run_id}")
    def get_run(run_id: str) -> dict[str, Any]:
        with store.connect() as db:
            row = db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        if not row:
            raise HTTPException(404, "run not found")
        value = dict(row)
        value["result"] = json.loads(value.pop("result_json") or "{}")
        value["progress"] = 1 if value["status"] in {"SUCCEEDED", "FAILED", "CANCELLED"} else 0
        return value

    @app.post("/api/v1/runs/{run_id}/cancel")
    @app.post("/runs/{run_id}/cancel")
    def cancel_run(run_id: str) -> dict[str, Any]:
        with store.connect() as db:
            cur = db.execute("UPDATE runs SET status=?,completed_at=? WHERE id=? AND status='RUNNING'", ("CANCELLED", datetime.now(timezone.utc).isoformat(), run_id))
            row = db.execute("SELECT status FROM runs WHERE id=?", (run_id,)).fetchone()
        if not row:
            raise HTTPException(404, "run not found")
        if cur.rowcount == 0 and row["status"] != "CANCELLED":
            raise HTTPException(409, "run is already complete")
        return {"run_id": run_id, "status": "CANCELLED"}

    @app.get("/api/v1/cases")
    @app.get("/cases")
    def list_cases(import_id: str | None = None, category: str | None = None, state: str | None = None,
                   query: str | None = None, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        if not import_id:
            with store.connect() as db:
                row = db.execute("SELECT id FROM imports ORDER BY created_at DESC LIMIT 1").fetchone()
            import_id = row["id"] if row else None
        if not import_id:
            return []
        values = [_case_payload(store, item) for item in store.list_cases(import_id)]
        query_lower = (query or "").casefold()
        filtered = [item for item in values if (not category or item.get("category") == category)
                    and (not state or item.get("state") == state)
                    and (not query_lower or query_lower in f"{item.get('email_id','')} {item.get('subject','')} {item.get('sender','')}".casefold())]
        return filtered[max(0, offset):max(0, offset) + max(1, min(limit, 500))]

    @app.get("/api/v1/cases/{case_id}")
    @app.get("/cases/{case_id}")
    def get_case(case_id: str) -> dict[str, Any]:
        value = store.get_case(case_id)
        if not value:
            with store.connect() as db:
                row = db.execute("SELECT id FROM cases WHERE email_id=? ORDER BY updated_at DESC LIMIT 1", (case_id,)).fetchone()
            value = store.get_case(row["id"]) if row else None
        if not value:
            raise HTTPException(404, "case not found")
        payload = _case_payload(store, value)
        payload["review_events"] = store.list_review_events(value["id"])
        return payload

    @app.get("/api/v1/documents/{document_id}/source")
    @app.get("/documents/{document_id}/source")
    def document_source(document_id: str):
        with store.connect() as db:
            row = db.execute("SELECT filename,format,bytes FROM documents WHERE id=?", (document_id,)).fetchone()
        if not row:
            raise HTTPException(404, "document not found")
        media = {"txt": "text/plain; charset=utf-8", "pdf": "application/pdf", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}.get(row["format"], "application/octet-stream")
        safe_name = str(row["filename"]).replace('"', "")
        return Response(content=row["bytes"], media_type=media, headers={"Content-Disposition": f'inline; filename="{safe_name}"'})

    @app.get("/api/v1/documents/{document_id}/preview")
    @app.get("/documents/{document_id}/preview")
    def document_preview(document_id: str) -> dict[str, Any]:
        with store.connect() as db:
            row = db.execute("SELECT read_json FROM documents WHERE id=?", (document_id,)).fetchone()
        if not row:
            raise HTTPException(404, "document not found")
        return json.loads(row["read_json"] or '{"blocks":[]}')

    @app.get("/api/v1/evidence/{evidence_id}")
    @app.get("/evidence/{evidence_id}")
    def evidence(evidence_id: str) -> dict[str, Any]:
        with store.connect() as db:
            row = db.execute("SELECT result_json FROM field_results WHERE id=?", (evidence_id,)).fetchone()
        if not row:
            raise HTTPException(404, "evidence not found")
        return json.loads(row["result_json"])

    @app.post("/api/v1/cases/{case_id}/reviews")
    @app.post("/cases/{case_id}/reviews")
    def review_case(case_id: str, body: dict[str, Any]) -> dict[str, Any]:
        case = store.get_case(case_id)
        if not case:
            raise HTTPException(404, "case not found")
        expected = int(body.get("expected_case_version", body.get("expectedCaseVersion", -1)))
        if expected != case["version"]:
            raise HTTPException(409, detail={"code": "stale_case", "current_version": case["version"]})
        result = case.get("result") or {}
        action = str(body.get("action", "confirm_finding"))
        field_name = body.get("field") or body.get("field_name")
        new_result = result
        run_id: str | None = None
        old_value: str | None = None
        if field_name:
            fields = {item["field"]: item for item in result.get("fields", [])}
            if field_name not in fields:
                raise HTTPException(400, "unknown comparison field")
            old_value = fields[field_name]["bl"].get("raw_value")
            si = {item["field"]: _obs_from_dict(item["si"]) for item in result.get("fields", [])}
            bl = {item["field"]: _obs_from_dict(item["bl"]) for item in result.get("fields", [])}
            side = str(body.get("side", "bl")).casefold()
            if action == "correct_reading":
                corrected = body.get("corrected_reading", body.get("correctedReading"))
                canonical, steps = normalize_field(field_name, corrected)
                if canonical is None:
                    raise HTTPException(400, "corrected reading is empty or unsupported")
                target = si if side == "si" else bl
                current = target[field_name]
                current.raw_value, current.canonical_value, current.normalization = str(corrected), canonical, steps + ["reviewer_corrected"]
                current.value_status = ValueStatus.PRESENT
                current.reason = "reviewer confirmed source-supported reading"
            elif action == "cannot_read":
                target = si if side == "si" else bl
                target[field_name].value_status = ValueStatus.UNREADABLE
                target[field_name].canonical_value = None
                target[field_name].raw_value = None
            compared = compare_documents(si, bl, category=case.get("category") or "BL_COMPARISON", issues=result.get("issues", []))
            new_result = _result_json(compared)
            digest = hashlib.sha256(json.dumps(new_result, sort_keys=True).encode()).hexdigest()
            run_id = store.create_run(case["import_id"], "assisted_review", digest, "review-v1")
            store.complete_run(run_id, {case["email_id"]: compared.to_submission()})
            if not store.save_case_result_if_version(run_id, case_id, case.get("category") or "BL_COMPARISON", case.get("classification") or {}, new_result, compared.verification, expected):
                raise HTTPException(409, detail={"code": "stale_case"})
        event_id = store.create_review_event(case_id=case_id, run_id=run_id, action=action, field=field_name,
                                             side=body.get("side"), old_value=old_value,
                                             new_value=body.get("corrected_reading", body.get("correctedReading")),
                                             reason=body.get("reason"), evidence=body.get("evidence_refs", body.get("evidenceRefs", [])), expected_version=expected)
        return {"event_id": event_id, "run_id": run_id, "case": get_case(case_id)}

    @app.post("/api/v1/cases/{case_id}/documents")
    @app.post("/cases/{case_id}/documents")
    async def add_document(case_id: str, file: UploadFile = File(...), role_hint: str | None = Form(None), expected_version: int = Form(-1)) -> dict[str, Any]:
        case = store.get_case(case_id)
        if not case:
            raise HTTPException(404, "case not found")
        if expected_version >= 0 and expected_version != case["version"]:
            raise HTTPException(409, "stale case")
        data = await file.read()
        read = read_document(data, file.filename or "document")
        if expected_version >= 0:
            inserted = store.add_document_for_case(
                case_id, case["import_id"], case["email_id"],
                f"attachments/{file.filename}", Path(file.filename or "document").name,
                read.sha256, read.detected_format, data, read.to_dict(), expected_version,
            )
            if inserted is None:
                raise HTTPException(409, "stale case")
            document_id, new_version = inserted
        else:
            document_id = store.add_document(case["import_id"], case["email_id"], f"attachments/{file.filename}", Path(file.filename or "document").name, read.sha256, read.detected_format, data, read.to_dict())
            new_version = case["version"]
        return {"document_id": document_id, "role_hint": role_hint, "read": read.to_dict(), "case_version": new_version}

    @app.post("/api/v1/cases/{case_id}/pair")
    @app.post("/cases/{case_id}/pair")
    def select_pair(case_id: str, body: dict[str, Any]) -> dict[str, Any]:
        case = store.get_case(case_id)
        if not case:
            raise HTTPException(404, "case not found")
        expected = int(body.get("expected_case_version", body.get("expectedCaseVersion", -1)))
        if expected != case["version"]:
            raise HTTPException(409, "stale case")
        pair_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with store.connect() as db:
            db.execute("INSERT INTO comparison_pairs(id,case_id,si_document_id,bl_document_id,selected_by,case_version,created_at) VALUES(?,?,?,?,?,?,?)",
                       (pair_id, case_id, body.get("si_document_id"), body.get("bl_document_id"), body.get("selected_by", "reviewer"), expected, now))
            db.execute("UPDATE cases SET version=version+1,updated_at=? WHERE id=? AND version=?", (now, case_id, expected))
        return {"pair_id": pair_id, "case_version": expected + 1}

    @app.post("/api/v1/cases/{case_id}/arbitration")
    @app.post("/cases/{case_id}/arbitration")
    def resolve_arbitration(case_id: str, body: dict[str, Any]) -> dict[str, Any]:
        """Settle a routing question a person was asked to arbitrate.

        The chosen category must be one the packet actually offered, so a
        resolution cannot invent an answer the reviewer was never shown. The
        decision then re-runs the comparison stage under that category, so the
        consequence the reviewer was told about is the one that happens.
        """
        case = store.get_case(case_id)
        if not case:
            raise HTTPException(404, "case not found")
        expected = int(body.get("expected_case_version", body.get("expectedCaseVersion", -1)))
        if expected != case["version"]:
            raise HTTPException(409, detail={"code": "stale_case", "current_version": case["version"]})
        classification = case.get("classification") or {}
        packet = (classification.get("gateway") or {}).get("arbitration")
        if not packet:
            raise HTTPException(400, "case has no open arbitration")
        chosen = str(body.get("category", "")).strip()
        offered = [option["category"] for option in packet.get("options", [])]
        if chosen not in offered:
            raise HTTPException(400, detail={"code": "category_not_offered", "offered": offered})

        with store.connect() as db:
            email_row = db.execute("SELECT raw_json FROM emails WHERE id=?", (case["id"],)).fetchone()
            doc_rows = db.execute("SELECT * FROM documents WHERE import_id=? AND email_id=?",
                                  (case["import_id"], case["email_id"])).fetchall()
        email = json.loads(email_row["raw_json"]) if email_row else {}
        result = verify_case([dict(d) for d in doc_rows], email, chosen,
                             classification.get("request_subtype"))

        resolved = dict(classification)
        resolved["category"] = chosen
        resolved["source"] = "human"
        gateway = dict(classification.get("gateway") or {})
        gateway.update({"disposition": "RESOLVED_BY_HUMAN", "tier": "human", "category": chosen,
                        "needs_human": False, "arbitration": None,
                        "resolved": {"category": chosen, "by": body.get("resolved_by", "reviewer"),
                                     "note": body.get("note"), "superseded": packet}})
        resolved["gateway"] = gateway

        run = store.latest_run(case["import_id"]) or {}
        store.create_review_event(
            case_id=case_id, run_id=run.get("id"), action="resolve_classification", field=None,
            side=None, old_value=classification.get("category"), new_value=chosen,
            reason=body.get("note"), evidence=[], expected_version=expected,
        )
        store.save_case_result(run.get("id"), case_id, chosen, resolved,
                               _result_json(result), result.verification)
        return {"case_id": case_id, "category": chosen, "verification": result.verification,
                "state": _state(result.verification, "SUCCEEDED", result.review_reason, False),
                "case_version": expected + 1, "result": _result_json(result)}

    @app.post("/api/v1/cases/{case_id}/retry")
    @app.post("/cases/{case_id}/retry")
    def retry_case(case_id: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        case = store.get_case(case_id)
        if not case:
            raise HTTPException(404, "case not found")
        run_id, _ = run_import(store, case["import_id"], (body or {}).get("mode", "local_rules"))
        return {"run_id": run_id, "status": "SUCCEEDED"}

    @app.post("/api/v1/cases/{case_id}/drafts")
    @app.post("/cases/{case_id}/drafts")
    def create_draft(case_id: str, body: dict[str, Any]) -> dict[str, Any]:
        case = store.get_case(case_id)
        if not case:
            raise HTTPException(404, "case not found")
        result = case.get("result") or {}
        kind = str(body.get("kind", body.get("draft_kind", "information_request")))
        lines = [f"Case {case['email_id']}", ""]
        for field in result.get("fields", []):
            if field["state"] == "MISMATCH" and kind in {"correction", "correction_request"}:
                lines.append(f"Please review {field['field']}: SI={field['si'].get('raw_value')}; BL={field['bl'].get('raw_value')}")
            if field["state"] == "UNRESOLVED" and kind in {"information_request", "missing_source"}:
                lines.append(f"Please provide the missing source value for {field['field']}.")
        if len(lines) == 2:
            lines.append("Please provide the source document or confirm the requested correction.")
        draft_id = store.create_draft(case_id=case_id, run_id=body.get("run_id"), kind=kind, text="\n".join(lines))
        return store.get_draft(draft_id) or {"id": draft_id}

    @app.patch("/api/v1/drafts/{draft_id}")
    @app.patch("/drafts/{draft_id}")
    def update_draft(draft_id: str, body: dict[str, Any]) -> dict[str, Any]:
        current = store.get_draft(draft_id)
        if not current:
            raise HTTPException(404, "draft not found")
        expected = int(body.get("expected_version", body.get("expectedVersion", current["version"])))
        updated = store.update_draft(draft_id, str(body.get("text", "")), expected)
        if updated is None:
            raise HTTPException(409, "stale draft")
        return updated

    @app.post("/api/v1/challenges")
    @app.post("/challenges")
    def create_challenge(body: dict[str, Any]) -> dict[str, Any]:
        try:
            return execute_challenge(store, str(body.get("fixture_id", body.get("fixture"))), str(body["mutation"]), int(body.get("seed", 42)))
        except (KeyError, ValueError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.post("/api/v1/challenges/{challenge_id}/run")
    @app.post("/challenges/{challenge_id}/run")
    def run_challenge(challenge_id: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        value = store.get_challenge(challenge_id)
        if not value:
            raise HTTPException(404, "challenge not found")
        try:
            return execute_challenge(store, value["fixture_id"], value["mutation"], int(value.get("seed", 42)), challenge_id=challenge_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.get("/api/v1/challenges/{challenge_id}")
    @app.get("/challenges/{challenge_id}")
    def get_challenge(challenge_id: str) -> dict[str, Any]:
        value = store.get_challenge(challenge_id)
        if not value:
            raise HTTPException(404, "challenge not found")
        return value

    @app.post("/api/v1/exports")
    @app.post("/exports")
    def create_export(body: dict[str, Any]) -> dict[str, Any]:
        run_id = body.get("run_id") or body.get("runId")
        if not run_id:
            raise HTTPException(400, "run_id is required")
        out = body.get("out", f"var/submission-{run_id}.json")
        machine_only = bool(body.get("machine_only", True))
        try:
            payload = export_run(store, run_id, out, machine_only=machine_only)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        export_id = str(uuid.uuid4())
        digest = hashlib.sha256(Path(out).read_bytes()).hexdigest()
        store.add_export(export_id, run_id, str(out), digest, machine_only)
        return {"id": export_id, "export_id": export_id, "path": str(out), "bytes_hash": digest, "emails": len(payload)}

    @app.get("/api/v1/exports/{export_id}/download")
    @app.get("/exports/{export_id}/download")
    def download_export(export_id: str):
        value = store.get_export(export_id)
        if not value or not Path(value["path"]).is_file():
            raise HTTPException(404, "export not found")
        return FileResponse(value["path"], media_type="application/json", filename=Path(value["path"]).name)

    @app.post("/api/v1/evaluations")
    @app.post("/evaluations")
    def evaluate(body: dict[str, Any]) -> dict[str, Any]:
        return {"available": False, "status": "PENDING_ORGANIZER", "run_id": body.get("run_id"), "message": "Organizer scoring is isolated from the application."}

    @app.get("/api/v1/metrics")
    @app.get("/metrics")
    def metrics(import_id: str | None = None) -> dict[str, Any]:
        if not import_id:
            with store.connect() as db:
                row = db.execute("SELECT id FROM imports ORDER BY created_at DESC LIMIT 1").fetchone()
            import_id = row["id"] if row else None
        if not import_id:
            return {"cases": 0, "comparisons": 0, "needs_review": 0, "complete": 0}
        cases = [_case_payload(store, item) for item in store.list_cases(import_id)]
        comparisons = [item for item in cases if item.get("category") == "BL_COMPARISON"]
        return {"import_id": import_id, "cases": len(cases), "comparisons": len(comparisons),
                "needs_review": sum(item.get("state") in {"Needs review", "Awaiting source"} for item in comparisons),
                "needs_classification_review": sum(item.get("state") == "Needs classification review" for item in cases),
                "complete": sum(item.get("state") == "Complete" for item in comparisons),
                "confirmed_differences": sum(item.get("confirmed_differences", 0) for item in comparisons),
                "unresolved_fields": sum(item.get("unresolved_fields", 0) for item in comparisons),
                "category_counts": dict(Counter(item.get("category") for item in cases))}

    return app


app = create_app() if FastAPI is not None else None
