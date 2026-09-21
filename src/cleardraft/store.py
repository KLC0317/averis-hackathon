"""Small SQLite persistence layer used by the local API/CLI.

The schema keeps raw email JSON and immutable document bytes metadata while
remaining dependency-light for the hackathon's native setup.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator


class StaleCaseVersionError(RuntimeError):
    """The caller's optimistic case version no longer identifies current state."""


class PairSelectionError(ValueError):
    """The requested document pair does not belong to the case."""



def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, path: str | Path = "var/cleardraft.db"):
        self._memory = str(path) == ":memory:"
        self.path = Path(path)
        # Each in-memory store gets its own shared-cache URI. A fixed URI leaks
        # rows between short-lived isolated runs (notably challenge/recovery
        # tests) while the anchor connection keeps that database alive.
        memory_uri = f"file:cleardraft-memory-{uuid.uuid4().hex}?mode=memory&cache=shared"
        self._db_target = memory_uri if self._memory else str(self.path)
        self._anchor = sqlite3.connect(self._db_target, uri=self._memory) if self._memory else None
        if not self._memory:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._db_target, uri=self._memory)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def initialize(self) -> None:
        with self.connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS imports (
              id TEXT PRIMARY KEY, source_mode TEXT NOT NULL, manifest_hash TEXT NOT NULL,
              created_at TEXT NOT NULL, status TEXT NOT NULL, email_count INTEGER DEFAULT 0,
              document_count INTEGER DEFAULT 0, issues_json TEXT NOT NULL DEFAULT '[]'
            );
            CREATE TABLE IF NOT EXISTS emails (
              id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES imports(id),
              email_id TEXT NOT NULL, raw_json TEXT NOT NULL, content_hash TEXT NOT NULL,
              UNIQUE(import_id, email_id)
            );
            CREATE TABLE IF NOT EXISTS documents (
              id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES imports(id),
              email_id TEXT, attachment_path TEXT NOT NULL, filename TEXT NOT NULL,
              sha256 TEXT NOT NULL, format TEXT NOT NULL, size INTEGER NOT NULL,
              bytes BLOB NOT NULL, read_json TEXT, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cases (
              id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES imports(id),
              email_id TEXT NOT NULL, category TEXT, classification_json TEXT,
              processing TEXT NOT NULL DEFAULT 'QUEUED', verification TEXT NOT NULL DEFAULT 'NOT_STARTED',
              result_json TEXT, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
              UNIQUE(import_id, email_id)
            );
            CREATE TABLE IF NOT EXISTS runs (
              id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES imports(id), mode TEXT NOT NULL,
              status TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT, result_json TEXT,
              input_hash TEXT NOT NULL, policy_version TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS field_results (
              id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), case_id TEXT NOT NULL,
              field TEXT NOT NULL, result_json TEXT NOT NULL, UNIQUE(run_id, case_id, field)
            );
            CREATE TABLE IF NOT EXISTS review_events (
              id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), run_id TEXT,
              action TEXT NOT NULL, field TEXT, side TEXT, old_value TEXT, new_value TEXT,
              reason TEXT, evidence_json TEXT NOT NULL DEFAULT '[]', expected_version INTEGER NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS drafts (
              id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), run_id TEXT,
              kind TEXT NOT NULL, text TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
              stale INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS challenges (
              id TEXT PRIMARY KEY, fixture_id TEXT NOT NULL, mutation TEXT NOT NULL,
              seed INTEGER NOT NULL, status TEXT NOT NULL, result_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS comparison_pairs (
              id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id),
              si_document_id TEXT, bl_document_id TEXT, selected_by TEXT NOT NULL,
              case_version INTEGER NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS exports (
              id TEXT PRIMARY KEY, run_id TEXT NOT NULL, path TEXT NOT NULL,
              bytes_hash TEXT, machine_only INTEGER NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}',
              result_json TEXT, status TEXT NOT NULL DEFAULT 'QUEUED', attempts INTEGER NOT NULL DEFAULT 0,
              max_attempts INTEGER NOT NULL DEFAULT 3, available_at TEXT NOT NULL,
              lease_owner TEXT, lease_expires_at TEXT, heartbeat_at TEXT,
              last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status, available_at, created_at);
            """)
            # Keep databases created by an earlier resilience slice readable.
            columns = {row["name"] for row in db.execute("PRAGMA table_info(jobs)").fetchall()}
            if "result_json" not in columns:
                db.execute("ALTER TABLE jobs ADD COLUMN result_json TEXT")

    def get_or_create_import(self, source_mode: str, manifest_hash: str, *,
                             issues: list[str] | None = None) -> tuple[str, bool]:
        """Return the import for a manifest, creating it exactly once."""
        iid = str(uuid.uuid4())
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute("SELECT id FROM imports WHERE manifest_hash=? ORDER BY created_at LIMIT 1",
                                  (manifest_hash,)).fetchone()
            if existing:
                return str(existing["id"]), False
            db.execute("INSERT INTO imports(id,source_mode,manifest_hash,created_at,status,issues_json) VALUES(?,?,?,?,?,?)",
                       (iid, source_mode, manifest_hash, utc_now(), "IMPORTED", json.dumps(issues or [])))
        return iid, True

    def create_import(self, source_mode: str, manifest_hash: str, *, issues: list[str] | None = None) -> str:
        """Create an immutable import, reusing an identical manifest."""
        iid, _ = self.get_or_create_import(source_mode, manifest_hash, issues=issues)
        return iid

    def save_case_result_and_review_if_version(self, *, run_id: str | None, case_id: str,
                                               category: str, classification: dict[str, Any],
                                               result: dict[str, Any], verification: str,
                                               action: str, field: str | None, side: str | None,
                                               old_value: str | None, new_value: str | None,
                                               reason: str | None, evidence: list[dict[str, Any]],
                                               expected_version: int) -> tuple[bool, str | None]:
        """Atomically apply a review result, version bump, and event.

        Both the compare-and-set and append-only event belong to one SQLite
        transaction.  A stale reviewer therefore cannot leave an event or an
        assisted result behind after another reviewer wins the race.
        """
        event_id = str(uuid.uuid4())
        with self.connect() as db:
            cur = db.execute(
                "UPDATE cases SET category=?,classification_json=?,processing=?,verification=?,result_json=?,updated_at=?,version=version+1 WHERE id=? AND version=?",
                (category, json.dumps(classification), "SUCCEEDED", verification,
                 json.dumps(result, ensure_ascii=False), utc_now(), case_id, expected_version),
            )
            if cur.rowcount != 1:
                return False, None
            for field_name, field_result in ((x["field"], x) for x in result.get("fields", [])):
                db.execute("INSERT OR REPLACE INTO field_results(id,run_id,case_id,field,result_json) VALUES(?,?,?,?,?)",
                           (str(uuid.uuid4()), run_id, case_id, field_name, json.dumps(field_result, ensure_ascii=False)))
            db.execute(
                "INSERT INTO review_events(id,case_id,run_id,action,field,side,old_value,new_value,reason,evidence_json,expected_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (event_id, case_id, run_id, action, field, side, old_value, new_value, reason,
                 json.dumps(evidence, ensure_ascii=False), expected_version, utc_now()),
            )
        return True, event_id

    def apply_review_transaction(
        self, *, import_id: str, email_id: str, case_id: str, category: str,
        classification: dict[str, Any], result: dict[str, Any], verification: str,
        expected_version: int, action: str, field: str | None, side: str | None,
        old_value: str | None, new_value: str | None, reason: str | None,
        evidence: list[dict[str, Any]], mode: str = "assisted_review",
        input_hash: str, policy_version: str, aggregate: dict[str, Any],
    ) -> tuple[bool, str | None, str | None]:
        """Atomically create an assisted run, apply the current case, and log review.

        The case version is checked under an immediate SQLite transaction before any
        dependent rows are written. A stale reviewer therefore leaves no orphan run,
        field results, or review event behind.
        """
        run_id = str(uuid.uuid4())
        event_id = str(uuid.uuid4())
        now = utc_now()
        run_result = {email_id: aggregate}
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute(
                "SELECT import_id,version FROM cases WHERE id=?", (case_id,)
            ).fetchone()
            if not current or current["import_id"] != import_id or int(current["version"]) != int(expected_version):
                return False, None, None
            db.execute(
                "INSERT INTO runs(id,import_id,mode,status,created_at,completed_at,result_json,input_hash,policy_version) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (run_id, import_id, mode, "SUCCEEDED", now, now,
                 json.dumps(run_result, ensure_ascii=False), input_hash, policy_version),
            )
            updated = db.execute(
                "UPDATE cases SET category=?,classification_json=?,processing=?,verification=?,result_json=?,updated_at=?,version=version+1 "
                "WHERE id=? AND version=?",
                (category, json.dumps(classification), str(result.get("processing", "SUCCEEDED")), verification,
                 json.dumps(result, ensure_ascii=False), now, case_id, expected_version),
            )
            if updated.rowcount != 1:
                return False, None, None
            for field_name, field_result in ((x["field"], x) for x in result.get("fields", [])):
                db.execute(
                    "INSERT OR REPLACE INTO field_results(id,run_id,case_id,field,result_json) VALUES(?,?,?,?,?)",
                    (str(uuid.uuid4()), run_id, case_id, field_name, json.dumps(field_result, ensure_ascii=False)),
                )
            db.execute(
                "INSERT INTO review_events(id,case_id,run_id,action,field,side,old_value,new_value,reason,evidence_json,expected_version,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (event_id, case_id, run_id, action, field, side, old_value, new_value, reason,
                 json.dumps(evidence, ensure_ascii=False), expected_version, now),
            )
        return True, run_id, event_id

    def add_email(self, import_id: str, email: dict[str, Any], content_hash: str) -> str:
        eid = str(uuid.uuid4())
        with self.connect() as db:
            db.execute("INSERT INTO emails(id,import_id,email_id,raw_json,content_hash) VALUES(?,?,?,?,?)",
                       (eid, import_id, email["email_id"], json.dumps(email, ensure_ascii=False, sort_keys=True), content_hash))
            db.execute("INSERT INTO cases(id,import_id,email_id,updated_at) VALUES(?,?,?,?)", (eid, import_id, email["email_id"], utc_now()))
        return eid

    def add_document(self, import_id: str, email_id: str, attachment_path: str, filename: str, sha256: str, fmt: str, data: bytes, read_json: dict[str, Any] | None = None) -> str:
        did = str(uuid.uuid4())
        with self.connect() as db:
            db.execute("INSERT INTO documents(id,import_id,email_id,attachment_path,filename,sha256,format,size,bytes,read_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                       (did, import_id, email_id, attachment_path, filename, sha256, fmt, len(data), data,
                        json.dumps(read_json, ensure_ascii=False) if read_json else None, utc_now()))
        return did

    def bump_case_version(self, case_id: str, expected_version: int) -> int | None:
        """Advance a case version using optimistic concurrency."""
        with self.connect() as db:
            cur = db.execute(
                "UPDATE cases SET version=version+1,updated_at=? WHERE id=? AND version=?",
                (utc_now(), case_id, expected_version),
            )
            if cur.rowcount != 1:
                return None
            row = db.execute("SELECT version FROM cases WHERE id=?", (case_id,)).fetchone()
        return int(row["version"]) if row else None

    def add_document_for_case(self, case_id: str, import_id: str, email_id: str,
                              attachment_path: str, filename: str, sha256: str,
                              fmt: str, data: bytes, read_json: dict[str, Any] | None,
                              expected_version: int) -> tuple[str, int] | None:
        """Insert a replacement source and advance its case version atomically."""
        did = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as db:
            cur = db.execute(
                "UPDATE cases SET version=version+1,updated_at=? WHERE id=? AND version=?",
                (now, case_id, expected_version),
            )
            if cur.rowcount != 1:
                return None
            db.execute(
                "INSERT INTO documents(id,import_id,email_id,attachment_path,filename,sha256,format,size,bytes,read_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (did, import_id, email_id, attachment_path, filename, sha256, fmt, len(data), data,
                 json.dumps(read_json, ensure_ascii=False) if read_json else None, now),
            )
        return did, expected_version + 1

    def update_import_counts(self, import_id: str, emails: int, documents: int, issues: list[str]) -> None:
        with self.connect() as db:
            db.execute("UPDATE imports SET email_count=?, document_count=?, issues_json=? WHERE id=?", (emails, documents, json.dumps(issues), import_id))

    def create_run(self, import_id: str, mode: str, input_hash: str, policy_version: str = "local-rules-v1") -> str:
        rid = str(uuid.uuid4())
        with self.connect() as db:
            db.execute("INSERT INTO runs(id,import_id,mode,status,created_at,input_hash,policy_version) VALUES(?,?,?,?,?,?,?)",
                       (rid, import_id, mode, "RUNNING", utc_now(), input_hash, policy_version))
        return rid

    def complete_run(self, run_id: str, result: dict[str, Any], *, status: str = "SUCCEEDED") -> None:
        with self.connect() as db:
            db.execute("UPDATE runs SET status=?,completed_at=?,result_json=? WHERE id=?", (status, utc_now(), json.dumps(result, ensure_ascii=False), run_id))

    def save_case_result(self, run_id: str, case_id: str, category: str, classification: dict[str, Any], result: dict[str, Any], verification: str) -> None:
        with self.connect() as db:
            processing = str(result.get("processing", "SUCCEEDED"))
            db.execute("UPDATE cases SET category=?,classification_json=?,processing=?,verification=?,result_json=?,updated_at=?,version=version+1 WHERE id=?",
                       (category, json.dumps(classification), processing, verification, json.dumps(result, ensure_ascii=False), utc_now(), case_id))
            for field, fr in ((x["field"], x) for x in result.get("fields", [])):
                db.execute("INSERT OR REPLACE INTO field_results(id,run_id,case_id,field,result_json) VALUES(?,?,?,?,?)",
                           (str(uuid.uuid4()), run_id, case_id, field, json.dumps(fr, ensure_ascii=False)))

    def get_import(self, import_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM imports WHERE id=?", (import_id,)).fetchone()
        if not row: return None
        item = dict(row); item["issues"] = json.loads(item.pop("issues_json")); return item

    def list_cases(self, import_id: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM cases WHERE import_id=? ORDER BY email_id", (import_id,)).fetchall()
        return [dict(row) for row in rows]

    def get_case(self, case_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM cases WHERE id=?", (case_id,)).fetchone()
        if not row:
            return None
        value = dict(row)
        for key in ("classification_json", "result_json"):
            raw = value.pop(key, None)
            if raw:
                try:
                    value[key.removesuffix("_json")] = json.loads(raw)
                except json.JSONDecodeError:
                    value[key.removesuffix("_json")] = None
            else:
                value[key.removesuffix("_json")] = None
        return value

    def save_challenge(self, result: dict[str, Any]) -> None:
        with self.connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO challenges(id,fixture_id,mutation,seed,status,result_json,created_at) VALUES(?,?,?,?,?,?,?)",
                (result["id"], result["fixture_id"], result["mutation"], int(result["seed"]), result["status"],
                 json.dumps(result, ensure_ascii=False), utc_now()),
            )

    def get_challenge(self, challenge_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT result_json FROM challenges WHERE id=?", (challenge_id,)).fetchone()
        return json.loads(row["result_json"]) if row else None

    def list_challenges(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT result_json FROM challenges ORDER BY created_at DESC").fetchall()
        return [json.loads(row["result_json"]) for row in rows]

    def create_review_event(self, *, case_id: str, run_id: str | None, action: str, field: str | None,
                            side: str | None, old_value: str | None, new_value: str | None,
                            reason: str | None, evidence: list[dict[str, Any]], expected_version: int) -> str:
        event_id = str(uuid.uuid4())
        with self.connect() as db:
            db.execute(
                "INSERT INTO review_events(id,case_id,run_id,action,field,side,old_value,new_value,reason,evidence_json,expected_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (event_id, case_id, run_id, action, field, side, old_value, new_value, reason,
                 json.dumps(evidence, ensure_ascii=False), expected_version, utc_now()),
            )
        return event_id

    def list_review_events(self, case_id: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM review_events WHERE case_id=? ORDER BY created_at", (case_id,)).fetchall()
        out = []
        for row in rows:
            value = dict(row)
            value["evidence"] = json.loads(value.pop("evidence_json") or "[]")
            out.append(value)
        return out

    def create_draft(self, *, case_id: str, run_id: str | None, kind: str, text: str) -> str:
        draft_id = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as db:
            db.execute("INSERT INTO drafts(id,case_id,run_id,kind,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                       (draft_id, case_id, run_id, kind, text, now, now))
        return draft_id

    def get_draft(self, draft_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM drafts WHERE id=?", (draft_id,)).fetchone()
        return dict(row) if row else None

    def update_draft(self, draft_id: str, text: str, expected_version: int) -> dict[str, Any] | None:
        with self.connect() as db:
            cur = db.execute("UPDATE drafts SET text=?,version=version+1,updated_at=? WHERE id=? AND version=?",
                             (text, utc_now(), draft_id, expected_version))
            if cur.rowcount != 1:
                return None
            row = db.execute("SELECT * FROM drafts WHERE id=?", (draft_id,)).fetchone()
        return dict(row) if row else None

    def save_case_result_if_version(self, run_id: str, case_id: str, category: str,
                                    classification: dict[str, Any], result: dict[str, Any],
                                    verification: str, expected_version: int) -> bool:
        """Apply a result only when the case version has not moved."""
        with self.connect() as db:
            cur = db.execute(
                "UPDATE cases SET category=?,classification_json=?,processing=?,verification=?,result_json=?,updated_at=?,version=version+1 WHERE id=? AND version=?",
                (category, json.dumps(classification), "SUCCEEDED", verification,
                 json.dumps(result, ensure_ascii=False), utc_now(), case_id, expected_version),
            )
            if cur.rowcount != 1:
                return False
            for field, fr in ((x["field"], x) for x in result.get("fields", [])):
                db.execute("INSERT OR REPLACE INTO field_results(id,run_id,case_id,field,result_json) VALUES(?,?,?,?,?)",
                           (str(uuid.uuid4()), run_id, case_id, field, json.dumps(fr, ensure_ascii=False)))
        return True

    def add_export(self, export_id: str, run_id: str, path: str, bytes_hash: str | None, machine_only: bool) -> None:
        with self.connect() as db:
            db.execute("INSERT INTO exports(id,run_id,path,bytes_hash,machine_only,created_at) VALUES(?,?,?,?,?,?)",
                       (export_id, run_id, path, bytes_hash, int(machine_only), utc_now()))

    def get_export(self, export_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM exports WHERE id=?", (export_id,)).fetchone()
        return dict(row) if row else None

    def list_emails(self, import_id: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM emails WHERE import_id=? ORDER BY email_id", (import_id,)).fetchall()
        out=[]
        for row in rows:
            d=dict(row); d["raw"] = json.loads(d.pop("raw_json")); out.append(d)
        return out

    def list_documents(self, import_id: str, email_id: str | None = None) -> list[dict[str, Any]]:
        with self.connect() as db:
            if email_id:
                rows = db.execute("SELECT * FROM documents WHERE import_id=? AND email_id=? ORDER BY attachment_path", (import_id, email_id)).fetchall()
            else:
                rows = db.execute("SELECT * FROM documents WHERE import_id=? ORDER BY email_id,attachment_path", (import_id,)).fetchall()
        return [dict(x) for x in rows]

    def select_pair(self, *, case_id: str, si_document_id: str | None,
                    bl_document_id: str | None, selected_by: str,
                    expected_version: int) -> tuple[str, int]:
        """Validate and atomically select a document pair for a case.

        Ownership and content-derived roles are checked inside the same
        transaction as the optimistic version update.  A stale update or any
        validation failure therefore leaves no orphaned pair row behind.
        """
        if not si_document_id or not bl_document_id:
            raise PairSelectionError("si_document_id and bl_document_id are required")
        if si_document_id == bl_document_id:
            raise PairSelectionError("SI and draft BL documents must be different")
        from .core import DocumentRole, identify_document_role
        from .readers import read_document

        with self.connect() as db:
            case = db.execute("SELECT import_id,email_id,version FROM cases WHERE id=?", (case_id,)).fetchone()
            if not case:
                raise PairSelectionError("case not found")
            if int(case["version"]) != int(expected_version):
                error = StaleCaseVersionError("stale case")
                error.current_version = int(case["version"])  # type: ignore[attr-defined]
                raise error
            rows = db.execute(
                "SELECT id,import_id,email_id,filename,bytes FROM documents "
                "WHERE id IN (?,?)", (si_document_id, bl_document_id),
            ).fetchall()
            by_id = {row["id"]: row for row in rows}
            if len(by_id) != 2:
                raise PairSelectionError("selected document not found")
            for document_id, expected_role in (
                (si_document_id, DocumentRole.SI), (bl_document_id, DocumentRole.DRAFT_BL),
            ):
                row = by_id[document_id]
                if row["import_id"] != case["import_id"] or row["email_id"] != case["email_id"]:
                    raise PairSelectionError("selected document does not belong to case")
                read = read_document(row["bytes"], row["filename"])
                role = identify_document_role(read.text, row["filename"])
                if role is not expected_role:
                    raise PairSelectionError(
                        f"{document_id} is not a {expected_role.value} document (detected {role.value})",
                    )
            now = utc_now()
            pair_id = str(uuid.uuid4())
            db.execute(
                "INSERT INTO comparison_pairs(id,case_id,si_document_id,bl_document_id,selected_by,case_version,created_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (pair_id, case_id, si_document_id, bl_document_id, selected_by or "reviewer", expected_version, now),
            )
            updated = db.execute(
                "UPDATE cases SET version=version+1,updated_at=? WHERE id=? AND version=?",
                (now, case_id, expected_version),
            )
            if updated.rowcount != 1:
                error = StaleCaseVersionError("stale case")
                current = db.execute("SELECT version FROM cases WHERE id=?", (case_id,)).fetchone()
                error.current_version = int(current["version"]) if current else None  # type: ignore[attr-defined]
                raise error
            return pair_id, expected_version + 1

    def latest_run(self, import_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM runs WHERE import_id=? ORDER BY created_at DESC LIMIT 1", (import_id,)).fetchone()
        return dict(row) if row else None

    def enqueue_job(self, kind: str, payload: dict[str, Any] | None = None, *,
                    max_attempts: int = 3, available_at: str | None = None) -> str:
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        job_id = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as db:
            db.execute(
                "INSERT INTO jobs(id,kind,payload_json,max_attempts,available_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                (job_id, kind, json.dumps(payload or {}, ensure_ascii=False), max_attempts,
                 available_at or now, now, now),
            )
        return job_id

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        return self._job_value(row) if row else None

    @staticmethod
    def _job_value(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        value = dict(row)
        value["payload"] = json.loads(value.pop("payload_json") or "{}")
        raw_result = value.pop("result_json", None)
        value["result"] = json.loads(raw_result) if raw_result else None
        return value

    def recover_expired_jobs(self, *, now: str | None = None) -> int:
        """Return leased jobs whose worker disappeared to the queue atomically."""
        current = now or utc_now()
        with self.connect() as db:
            cur = db.execute(
                "UPDATE jobs SET status=CASE WHEN attempts>=max_attempts THEN 'FAILED' ELSE 'QUEUED' END, "
                "last_error=CASE WHEN attempts>=max_attempts THEN COALESCE(last_error, 'lease expired') ELSE last_error END, "
                "lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL, available_at=?, updated_at=? "
                "WHERE status='RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at<=?",
                (current, current, current),
            )
            return cur.rowcount

    def claim_job(self, worker_id: str, *, lease_seconds: float = 30.0, now: str | None = None) -> dict[str, Any] | None:
        """Atomically claim the oldest available job, recovering stale leases first."""
        if lease_seconds <= 0:
            raise ValueError("lease_seconds must be positive")
        current = now or utc_now()
        expires = (datetime.fromisoformat(current) + timedelta(seconds=lease_seconds)).isoformat()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "UPDATE jobs SET status=CASE WHEN attempts>=max_attempts THEN 'FAILED' ELSE 'QUEUED' END, "
                "last_error=CASE WHEN attempts>=max_attempts THEN COALESCE(last_error, 'lease expired') ELSE last_error END, "
                "lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL, available_at=?, updated_at=? "
                "WHERE status='RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at<=?",
                (current, current, current),
            )
            row = db.execute(
                "SELECT * FROM jobs WHERE status='QUEUED' AND available_at<=? AND attempts<max_attempts ORDER BY created_at, id LIMIT 1",
                (current,),
            ).fetchone()
            if row is None:
                return None
            cur = db.execute(
                "UPDATE jobs SET status='RUNNING', attempts=attempts+1, lease_owner=?, lease_expires_at=?, heartbeat_at=?, updated_at=? "
                "WHERE id=? AND status='QUEUED'",
                (worker_id, expires, current, current, row["id"]),
            )
            if cur.rowcount != 1:
                return None
            claimed = db.execute("SELECT * FROM jobs WHERE id=?", (row["id"],)).fetchone()
        return self._job_value(claimed)

    def heartbeat_job(self, job_id: str, worker_id: str, *, lease_seconds: float = 30.0,
                      now: str | None = None) -> bool:
        if lease_seconds <= 0:
            raise ValueError("lease_seconds must be positive")
        current = now or utc_now()
        expires = (datetime.fromisoformat(current) + timedelta(seconds=lease_seconds)).isoformat()
        with self.connect() as db:
            cur = db.execute(
                "UPDATE jobs SET lease_expires_at=?, heartbeat_at=?, updated_at=? WHERE id=? AND status='RUNNING' AND lease_owner=?",
                (expires, current, current, job_id, worker_id),
            )
        return cur.rowcount == 1

    def complete_job(self, job_id: str, worker_id: str, result: dict[str, Any] | None = None) -> bool:
        with self.connect() as db:
            cur = db.execute(
                "UPDATE jobs SET status='SUCCEEDED', result_json=?, lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL, updated_at=? "
                "WHERE id=? AND status='RUNNING' AND lease_owner=?",
                (json.dumps(result or {}, ensure_ascii=False), utc_now(), job_id, worker_id),
            )
        return cur.rowcount == 1

    def fail_job(self, job_id: str, worker_id: str, error: str, *, retry: bool = True,
                 retry_delay_seconds: float = 0.0) -> bool:
        now = datetime.now(timezone.utc)
        with self.connect() as db:
            row = db.execute("SELECT attempts,max_attempts FROM jobs WHERE id=? AND status='RUNNING' AND lease_owner=?",
                             (job_id, worker_id)).fetchone()
            if row is None:
                return False
            retryable = retry and row["attempts"] < row["max_attempts"]
            status = "QUEUED" if retryable else "FAILED"
            available = (now + timedelta(seconds=max(0.0, retry_delay_seconds))).isoformat()
            cur = db.execute(
                "UPDATE jobs SET status=?, last_error=?, available_at=?, lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL, updated_at=? "
                "WHERE id=? AND status='RUNNING' AND lease_owner=?",
                (status, str(error), available, now.isoformat(), job_id, worker_id),
            )
        return cur.rowcount == 1

    def list_jobs(self, *, status: str | None = None) -> list[dict[str, Any]]:
        with self.connect() as db:
            if status:
                rows = db.execute("SELECT * FROM jobs WHERE status=? ORDER BY created_at", (status,)).fetchall()
            else:
                rows = db.execute("SELECT * FROM jobs ORDER BY created_at").fetchall()
        return [self._job_value(row) for row in rows]
