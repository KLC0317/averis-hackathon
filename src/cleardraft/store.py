"""Small SQLite persistence layer used by the local API/CLI.

The schema keeps raw email JSON and immutable document bytes metadata while
remaining dependency-light for the hackathon's native setup.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, path: str | Path = "var/cleardraft.db"):
        self._memory = str(path) == ":memory:"
        self.path = Path(path)
        self._db_target = "file:cleardraft-memory?mode=memory&cache=shared" if self._memory else str(self.path)
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
            """)

    def create_import(self, source_mode: str, manifest_hash: str, *, issues: list[str] | None = None) -> str:
        iid = str(uuid.uuid4())
        with self.connect() as db:
            db.execute("INSERT INTO imports(id,source_mode,manifest_hash,created_at,status,issues_json) VALUES(?,?,?,?,?,?)",
                       (iid, source_mode, manifest_hash, utc_now(), "IMPORTED", json.dumps(issues or [])))
        return iid

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
            db.execute("UPDATE cases SET category=?,classification_json=?,processing=?,verification=?,result_json=?,updated_at=?,version=version+1 WHERE id=?",
                       (category, json.dumps(classification), "SUCCEEDED", verification, json.dumps(result, ensure_ascii=False), utc_now(), case_id))
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

    def latest_run(self, import_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM runs WHERE import_id=? ORDER BY created_at DESC LIMIT 1", (import_id,)).fetchone()
        return dict(row) if row else None
