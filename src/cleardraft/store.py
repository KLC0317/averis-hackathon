"""Small SQLite persistence layer used by the local API/CLI.

The schema keeps raw email JSON and immutable document bytes metadata while
remaining dependency-light for the hackathon's native setup.
"""

from __future__ import annotations

import json
import re
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
              disposition TEXT, disposition_reason TEXT, disposition_at TEXT, disposition_by TEXT,
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
            CREATE TABLE IF NOT EXISTS prompt_example_sets (
              id TEXT PRIMARY KEY, version TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'draft',
              examples_json TEXT NOT NULL DEFAULT '[]', source_event_ids_json TEXT NOT NULL DEFAULT '[]',
              notes TEXT, created_by TEXT NOT NULL DEFAULT 'operator', created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mailbox_connections (
              id TEXT PRIMARY KEY, label TEXT NOT NULL, provider TEXT NOT NULL,
              host TEXT NOT NULL, port INTEGER NOT NULL, username TEXT NOT NULL,
              folder TEXT NOT NULL DEFAULT 'INBOX', last_uid INTEGER DEFAULT 0,
              last_polled_at TEXT, status TEXT NOT NULL DEFAULT 'configured', created_at TEXT NOT NULL
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
            # Seed default mailbox presets if empty
            existing_conns = db.execute("SELECT COUNT(*) AS c FROM mailbox_connections").fetchone()
            if existing_conns and int(existing_conns["c"]) == 0:
                now_str = utc_now()
                presets = [
                    ("conn_gmail", "Demo Gmail (Docs Intake)", "gmail", "imap.gmail.com", 993, "cleardraft.intake@gmail.com", "INBOX", 0, None, "ready", now_str),
                    ("conn_outlook", "Office 365 Shipping Mailbox", "outlook", "outlook.office365.com", 993, "shipping.verification@company.com", "INBOX", 0, None, "ready", now_str),
                    ("conn_generic", "Averis Enterprise IMAP", "imap", "mail.averis-trade.internal", 993, "doc-ops@averis-trade.internal", "INBOX", 0, None, "ready", now_str)
                ]
                db.executemany(
                    "INSERT INTO mailbox_connections(id, label, provider, host, port, username, folder, last_uid, last_polled_at, status, created_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    presets
                )
            # Keep databases created by an earlier resilience slice readable.
            columns = {row["name"] for row in db.execute("PRAGMA table_info(jobs)").fetchall()}
            if "result_json" not in columns:
                db.execute("ALTER TABLE jobs ADD COLUMN result_json TEXT")
            case_columns = {row["name"] for row in db.execute("PRAGMA table_info(cases)").fetchall()}
            for column in ("disposition", "disposition_reason", "disposition_at", "disposition_by"):
                if column not in case_columns:
                    db.execute(f"ALTER TABLE cases ADD COLUMN {column} TEXT")

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

    def close_case(self, case_id: str, *, expected_version: int, reason: str,
                   actor: str = "reviewer") -> tuple[bool, str | None, str | None]:
        """Mark a case operator-closed while leaving every finding intact.

        This is the terminal state for a genuine, correctly-detected discrepancy:
        the operator has actioned it outside the system and is closing the case.
        It deliberately does not touch ``verification`` or any field result, so a
        confirmed MISMATCH is never rewritten to MATCH in order to drain a queue.

        Closing is refused unless every open field already carries a review event,
        which stops an unexamined case from being closed in bulk. Returns
        ``(applied, event_id, error_code)``.
        """
        event_id = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute(
                "SELECT version, result_json, disposition FROM cases WHERE id=?", (case_id,)
            ).fetchone()
            if not current:
                return False, None, "case_not_found"
            if int(current["version"]) != int(expected_version):
                return False, None, "stale_case"
            if current["disposition"] == "OPERATOR_CLOSED":
                return False, None, "already_closed"
            try:
                result = json.loads(current["result_json"] or "{}")
            except json.JSONDecodeError:
                result = {}
            open_fields = set(result.get("confirmed_mismatch_fields") or []) | set(
                result.get("unresolved_fields") or [])
            if open_fields:
                reviewed = {
                    row["field"] for row in db.execute(
                        "SELECT DISTINCT field FROM review_events WHERE case_id=? AND field IS NOT NULL",
                        (case_id,)).fetchall()
                }
                if open_fields - reviewed:
                    return False, None, "unreviewed_fields"
            updated = db.execute(
                "UPDATE cases SET disposition='OPERATOR_CLOSED', disposition_reason=?, disposition_at=?, "
                "disposition_by=?, updated_at=?, version=version+1 WHERE id=? AND version=?",
                (reason, now, actor, now, case_id, expected_version),
            )
            if updated.rowcount != 1:
                return False, None, "stale_case"
            db.execute(
                "INSERT INTO review_events(id,case_id,run_id,action,field,side,old_value,new_value,reason,"
                "evidence_json,expected_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (event_id, case_id, None, "close_case", None, None, None, "OPERATOR_CLOSED",
                 reason, "[]", expected_version, now),
            )
        return True, event_id, None

    def reopen_case(self, case_id: str, *, expected_version: int, reason: str,
                    actor: str = "reviewer") -> tuple[bool, str | None, str | None]:
        """Return an operator-closed case to the active review queue."""
        event_id = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute(
                "SELECT version, disposition FROM cases WHERE id=?", (case_id,)
            ).fetchone()
            if not current:
                return False, None, "case_not_found"
            if int(current["version"]) != int(expected_version):
                return False, None, "stale_case"
            if current["disposition"] != "OPERATOR_CLOSED":
                return False, None, "not_closed"
            updated = db.execute(
                "UPDATE cases SET disposition=NULL, disposition_reason=NULL, disposition_at=NULL, "
                "disposition_by=NULL, updated_at=?, version=version+1 WHERE id=? AND version=?",
                (now, case_id, expected_version),
            )
            if updated.rowcount != 1:
                return False, None, "stale_case"
            db.execute(
                "INSERT INTO review_events(id,case_id,run_id,action,field,side,old_value,new_value,reason,"
                "evidence_json,expected_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (event_id, case_id, None, "reopen_case", None, None, "OPERATOR_CLOSED", None,
                 f"{reason} [by: {actor}]", "[]", expected_version, now),
            )
        return True, event_id, None

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

    def list_drafts(self, case_id: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM drafts WHERE case_id=? ORDER BY created_at DESC", (case_id,)).fetchall()
        return [dict(row) for row in rows]

    def get_review_metrics(self) -> dict[str, Any]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM review_events ORDER BY created_at").fetchall()
        if not rows:
            return {"count": 0, "avg_seconds": None}
        durations = []
        for r in rows:
            ev = json.loads(r["evidence_json"] or "[]")
            d = None
            for item in ev:
                if isinstance(item, dict) and "duration_seconds" in item:
                    try:
                        d = float(item["duration_seconds"])
                        break
                    except (ValueError, TypeError):
                        pass
            if d is None and r["reason"] and "time_to_resolve:" in r["reason"]:
                m = re.search(r"time_to_resolve:\s*([\d.]+)s?", r["reason"])
                if m:
                    try:
                        d = float(m.group(1))
                    except ValueError:
                        pass
            if d is not None:
                durations.append(d)
        avg_d = round(sum(durations) / len(durations), 1) if durations else None
        return {"count": len(rows), "measured_count": len(durations), "avg_seconds": avg_d}


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

    # -------------------------------------------------------------------------
    # Prompt Example Sets & Correction Candidates (Feature A)
    # -------------------------------------------------------------------------
    def list_correction_candidates(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            set_rows = db.execute("SELECT source_event_ids_json FROM prompt_example_sets").fetchall()
            promoted_ids: set[str] = set()
            for r in set_rows:
                try:
                    for eid in json.loads(r["source_event_ids_json"] or "[]"):
                        promoted_ids.add(str(eid))
                except Exception:
                    pass

            events = db.execute(
                "SELECT r.*, c.email_id, c.import_id, e.raw_json "
                "FROM review_events r "
                "JOIN cases c ON r.case_id = c.id "
                "LEFT JOIN emails e ON c.id = e.id "
                "WHERE r.action IN ('classification_correction', 'resolve_classification') "
                "ORDER BY r.created_at DESC"
            ).fetchall()

        candidates = []
        for row in events:
            ev_id = row["id"]
            email_data = json.loads(row["raw_json"]) if row["raw_json"] else {}
            body_text = email_data.get("body", "")
            excerpt = body_text[:280] + ("…" if len(body_text) > 280 else "")
            candidates.append({
                "id": ev_id,
                "case_id": row["case_id"],
                "email_id": row["email_id"],
                "import_id": row["import_id"],
                "subject": email_data.get("subject", "No Subject"),
                "sender": email_data.get("from", ""),
                "body_excerpt": excerpt,
                "old_category": row["old_value"],
                "new_category": row["new_value"],
                "rationale": row["reason"] or "",
                "created_at": row["created_at"],
                "is_promoted": ev_id in promoted_ids,
            })
        return candidates

    def list_prompt_example_sets(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM prompt_example_sets ORDER BY created_at DESC").fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["examples"] = json.loads(d.pop("examples_json") or "[]")
            d["source_event_ids"] = json.loads(d.pop("source_event_ids_json") or "[]")
            result.append(d)
        return result

    def get_active_prompt_example_set(self) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM prompt_example_sets WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["examples"] = json.loads(d.pop("examples_json") or "[]")
        d["source_event_ids"] = json.loads(d.pop("source_event_ids_json") or "[]")
        return d

    def create_prompt_example_set(
        self,
        version: str,
        examples: list[dict[str, Any]],
        source_event_ids: list[str],
        notes: str | None = None,
        created_by: str = "operator",
        status: str = "active"
    ) -> dict[str, Any]:
        set_id = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as db:
            if status == "active":
                db.execute("UPDATE prompt_example_sets SET status = 'retired' WHERE status = 'active'")
            db.execute(
                "INSERT INTO prompt_example_sets(id, version, status, examples_json, source_event_ids_json, notes, created_by, created_at) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (set_id, version, status, json.dumps(examples, ensure_ascii=False), json.dumps(source_event_ids), notes, created_by, now)
            )
        return {
            "id": set_id,
            "version": version,
            "status": status,
            "examples": examples,
            "source_event_ids": source_event_ids,
            "notes": notes,
            "created_by": created_by,
            "created_at": now
        }

    # -------------------------------------------------------------------------
    # Mailbox Connections (Feature B)
    # -------------------------------------------------------------------------
    def list_mailbox_connections(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM mailbox_connections ORDER BY created_at ASC").fetchall()
        return [dict(r) for r in rows]

    def get_mailbox_connection(self, conn_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM mailbox_connections WHERE id = ?", (conn_id,)).fetchone()
        return dict(row) if row else None

    def save_mailbox_connection(
        self,
        conn_id: str,
        label: str,
        provider: str,
        host: str,
        port: int,
        username: str,
        folder: str = "INBOX"
    ) -> dict[str, Any]:
        now = utc_now()
        with self.connect() as db:
            db.execute(
                "INSERT INTO mailbox_connections(id, label, provider, host, port, username, folder, status, created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET label=excluded.label, provider=excluded.provider, host=excluded.host, port=excluded.port, username=excluded.username, folder=excluded.folder",
                (conn_id, label, provider, host, port, username, folder, "ready", now)
            )
        return self.get_mailbox_connection(conn_id) or {}

    def update_mailbox_cursor(
        self,
        conn_id: str,
        last_uid: int,
        status: str = "connected",
        last_polled_at: str | None = None
    ) -> None:
        now = last_polled_at or utc_now()
        with self.connect() as db:
            db.execute(
                "UPDATE mailbox_connections SET last_uid=?, status=?, last_polled_at=? WHERE id=?",
                (last_uid, status, now, conn_id)
            )

    # -------------------------------------------------------------------------
    # Taught Equivalence & Comparison Precedents (Feature A - Revised Scope)
    # -------------------------------------------------------------------------
    def find_field_precedent(self, field: str, si_val: str | None, bl_val: str | None) -> dict[str, Any] | None:
        """Finds a prior operator-taught equivalence that generalizes to this pair.

        Only ``confirm_equivalence`` events are eligible - a reviewer explicitly
        taught two values are the same entity, as distinct from an OCR fix
        (``correct_reading``) or an unreadable-source flag (``cannot_read``),
        neither of which asserts anything about equivalence.

        Matching runs the current and stored values through the same
        ``normalize_field`` pipeline used at comparison time, so a taught fix
        generalizes along the rule the normalizer already encodes (e.g. a
        party-name suffix truncation) rather than only ever matching the exact
        strings originally taught. Raw substring matching is a fallback tier,
        confined to free-text fields with a minimum length so short numeric
        tokens (container counts, weights) can't cross-match unrelated values.

        Strictly a suggestion for a human to confirm; this never mutates a case.
        """
        from .core import normalize_field

        s_si = str(si_val or "").strip().lower()
        s_bl = str(bl_val or "").strip().lower()
        if not s_si and not s_bl:
            return None

        current_si_canon = (normalize_field(field, si_val)[0] or "").strip().lower() if si_val else ""
        current_bl_canon = (normalize_field(field, bl_val)[0] or "").strip().lower() if bl_val else ""
        # Numeric/coded fields normalize to a small alphabet where short strings
        # collide by chance; only exact or normalized matches are trusted there.
        is_free_text = field not in {"container_count", "gross_weight_kg"}
        min_substring_len = 4

        with self.connect() as db:
            rows = db.execute(
                "SELECT id, case_id, action, field, old_value, new_value, reason, created_at "
                "FROM review_events "
                "WHERE field = ? AND action = 'confirm_equivalence' "
                "AND reason IS NOT NULL AND length(trim(reason)) > 0 "
                "ORDER BY created_at DESC",
                (field,)
            ).fetchall()

        for r in rows:
            ev_old = str(r["old_value"] or "").strip().lower()
            ev_new = str(r["new_value"] or "").strip().lower()
            if not ev_old and not ev_new:
                continue
            ev_old_canon = (normalize_field(field, r["old_value"])[0] or "").strip().lower() if r["old_value"] else ""
            ev_new_canon = (normalize_field(field, r["new_value"])[0] or "").strip().lower() if r["new_value"] else ""

            # Bidirectional exact match on the raw taught values.
            exact = (
                (s_si and ev_old and s_si == ev_old and s_bl and ev_new and s_bl == ev_new)
                or (s_si and ev_new and s_si == ev_new and s_bl and ev_old and s_bl == ev_old)
            )

            # Bidirectional match after normalization: the current pair is a
            # different raw string but reduces to the same canonical value the
            # operator already confirmed equivalent - this is the generalization
            # step, not a literal replay of the taught strings.
            normalized = False
            if not exact and current_si_canon and current_bl_canon and ev_old_canon and ev_new_canon:
                normalized = (
                    (current_si_canon == ev_old_canon and current_bl_canon == ev_new_canon)
                    or (current_si_canon == ev_new_canon and current_bl_canon == ev_old_canon)
                )

            # Substring / token pattern match, free-text fields only, with a
            # minimum length floor so single digits or short codes can't match.
            sub_match = False
            if not exact and not normalized and is_free_text:
                def _long_enough(a: str, b: str) -> bool:
                    return len(a) >= min_substring_len and len(b) >= min_substring_len

                if ev_old and ev_new:
                    if _long_enough(ev_old, s_si) and (ev_old in s_si or s_si in ev_old) \
                            and _long_enough(ev_new, s_bl) and (ev_new in s_bl or s_bl in ev_new):
                        sub_match = True
                    elif _long_enough(ev_new, s_si) and (ev_new in s_si or s_si in ev_new) \
                            and _long_enough(ev_old, s_bl) and (ev_old in s_bl or s_bl in ev_old):
                        sub_match = True
                elif ev_old and not ev_new and _long_enough(ev_old, s_si or s_bl):
                    if ev_old in s_si or ev_old in s_bl:
                        sub_match = True

            if exact or normalized or sub_match:
                clean_rationale = re.sub(r"\s*\[time_to_resolve:.*?\]", "", r["reason"] or "").strip()
                match_basis = "exact" if exact else ("normalized" if normalized else "substring")
                return {
                    "event_id": r["id"],
                    "case_id": r["case_id"],
                    "field": field,
                    "si_pattern": r["old_value"],
                    "bl_pattern": r["new_value"],
                    "rationale": clean_rationale,
                    "action": r["action"],
                    "confidence": "HIGH" if (exact or normalized) else "SUGGESTED",
                    "match_basis": match_basis,
                    "created_at": r["created_at"]
                }
        return None

    def get_case_precedents(self, case_id: str) -> dict[str, Any]:
        """Scans discrepancy fields on a case and returns any taught precedents as review aids."""
        case = self.get_case(case_id)
        if not case:
            return {}
        result = case.get("result") or {}
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except Exception:
                result = {}
        fields = result.get("fields") or []
        precedents: dict[str, Any] = {}
        for f in fields:
            if isinstance(f, dict):
                st = f.get("state") or f.get("status")
                if st in {"MISMATCH", "UNRESOLVED", "AMBIGUOUS", "NEEDS_REVIEW"}:
                    f_name = f.get("field")
                    si_val = f.get("si_value") or (f.get("si") or {}).get("raw_value") or (f.get("si") or {}).get("canonical_value")
                    bl_val = f.get("bl_value") or (f.get("bl") or {}).get("raw_value") or (f.get("bl") or {}).get("canonical_value")
                    prec = self.find_field_precedent(f_name, si_val, bl_val)
                    if prec:
                        precedents[f_name] = prec
        return precedents

    def list_all_review_events(self, limit: int = 200) -> list[dict[str, Any]]:
        """Returns chronological review events across all cases with case and email metadata."""
        with self.connect() as db:
            rows = db.execute(
                "SELECT r.id, r.case_id, r.run_id, r.action, r.field, r.side, r.old_value, r.new_value, "
                "       r.reason, r.evidence_json, r.expected_version, r.created_at, "
                "       c.email_id, c.category as case_category, e.raw_json "
                "FROM review_events r "
                "LEFT JOIN cases c ON r.case_id = c.id "
                "LEFT JOIN emails e ON c.id = e.id "
                "ORDER BY r.created_at DESC "
                "LIMIT ?",
                (limit,)
            ).fetchall()
        out = []
        for r in rows:
            val = dict(r)
            raw = val.pop("raw_json", None)
            email_data = json.loads(raw) if raw else {}
            val["subject"] = email_data.get("subject", "No Subject")
            val["sender"] = email_data.get("from", "")
            val["evidence"] = json.loads(val.pop("evidence_json", "[]") or "[]")
            out.append(val)
        return out

    def list_all_precedents(self) -> list[dict[str, Any]]:
        """Returns all distinct taught equivalence conventions recorded by operators."""
        with self.connect() as db:
            rows = db.execute(
                "SELECT r.id, r.case_id, r.action, r.field, r.old_value, r.new_value, r.reason, r.created_at, "
                "       c.email_id, e.raw_json "
                "FROM review_events r "
                "LEFT JOIN cases c ON r.case_id = c.id "
                "LEFT JOIN emails e ON c.id = e.id "
                "WHERE r.action = 'confirm_equivalence' AND r.reason IS NOT NULL AND length(trim(r.reason)) > 0 "
                "ORDER BY r.created_at DESC"
            ).fetchall()
        out = []
        seen = set()
        for r in rows:
            key = (r["field"], str(r["old_value"] or "").strip().lower(), str(r["new_value"] or "").strip().lower())
            if key in seen:
                continue
            seen.add(key)
            val = dict(r)
            raw = val.pop("raw_json", None)
            email_data = json.loads(raw) if raw else {}
            val["subject"] = email_data.get("subject", "No Subject")
            clean_rationale = re.sub(r"\s*\[time_to_resolve:.*?\]", "", val["reason"] or "").strip()
            val["clean_rationale"] = clean_rationale
            out.append(val)
        return out


