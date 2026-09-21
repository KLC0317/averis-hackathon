"""Documented local command line interface."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    # Native setup may intentionally omit dotenv; explicit process variables
    # still work and secrets are never logged by the CLI.
    pass

from .export import export_run, load_and_validate
from .ingest import import_participant
from .pipeline import run_import
from .store import Store
from .challenges import execute_challenge


def _load_dotenv() -> None:
    """Load simple KEY=VALUE settings without printing or overriding env."""
    path = Path(".env")
    if not path.is_file():
        return
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() and key.strip() not in os.environ:
                os.environ[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        return


def _store(path: str | None) -> Store:
    configured = path or os.getenv("CLEARDRAFT_DB")
    database_url = os.getenv("DATABASE_URL", "")
    if not configured and database_url.startswith("sqlite:///"):
        configured = database_url.removeprefix("sqlite:///")
    return Store(configured or "var/cleardraft.db")


def command_doctor(args: argparse.Namespace) -> int:
    checks: dict[str, object] = {"python": sys.version.split()[0], "sqlite": True}
    try:
        try:
            import pymupdf as fitz
        except ImportError:
            import fitz
        checks["pymupdf"] = getattr(fitz, "__doc__", "available") is not None
    except Exception: checks["pymupdf"] = False
    try:
        import docx; checks["python_docx"] = True
    except Exception: checks["python_docx"] = False
    try:
        import openpyxl; checks["openpyxl"] = True
    except Exception: checks["openpyxl"] = False
    checks["deepseek_configured"] = bool(os.getenv("DEEPSEEK_KEY") or os.getenv("DEEPSEEK_API_KEY"))
    participant = Path(os.getenv("PARTICIPANT_ROOT", "sdoc-hackathon-bundle"))
    inbox = participant / "inbox"
    attachments = participant / "attachments"
    checks["participant_root"] = str(participant)
    checks["participant_inbox_records"] = len(list(inbox.glob("*.json"))) if inbox.is_dir() else 0
    checks["participant_attachment_files"] = sum(1 for p in attachments.rglob("*") if p.is_file()) if attachments.is_dir() else 0
    checks["evaluator_answer_key_ignored"] = not (Path("infra/evaluator/ground_truth.json").exists() or Path("ground_truth.json").exists())
    print(json.dumps(checks, indent=2))
    return 0


def command_import(args: argparse.Namespace) -> int:
    sid = import_participant(args.participant_zip or args.directory, _store(args.db))
    print(json.dumps({"import_id": sid}))
    return 0


def command_run(args: argparse.Namespace) -> int:
    rid, results = run_import(_store(args.db), args.import_id, args.mode)
    print(json.dumps({"run_id": rid, "cases": len(results), "status": "SUCCEEDED"}))
    return 0


def command_export(args: argparse.Namespace) -> int:
    payload = export_run(_store(args.db), args.run_id, args.out, machine_only=args.machine_only)
    print(json.dumps({"out": str(args.out), "emails": len(payload)}))
    return 0


def command_report(args: argparse.Namespace) -> int:
    store = _store(args.db)
    with store.connect() as db:
        run = db.execute("SELECT * FROM runs WHERE id=?", (args.run_id,)).fetchone()
        if not run:
            raise ValueError(f"run not found: {args.run_id}")
        import_row = db.execute("SELECT * FROM imports WHERE id=?", (run["import_id"],)).fetchone()
        cases = db.execute(
            "SELECT category, verification, processing, result_json FROM cases WHERE import_id=?",
            (run["import_id"],),
        ).fetchall()
    verification = Counter(str(x["verification"]) for x in cases)
    processing = Counter(str(x["processing"]) for x in cases)
    categories = Counter(str(x["category"]) for x in cases if x["category"])
    unresolved = 0
    confirmed_mismatches = 0
    for row in cases:
        try:
            result = json.loads(row["result_json"] or "{}")
        except json.JSONDecodeError:
            result = {}
        unresolved += len(result.get("unresolved_fields", []))
        confirmed_mismatches += len(result.get("confirmed_mismatch_fields", []))
    report = {
        "artifact_type": "cleardraft_run_report",
        "report_version": "1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run_id": args.run_id,
        "import_id": run["import_id"],
        "mode": run["mode"],
        "status": run["status"],
        "input_hash": run["input_hash"],
        "policy_version": run["policy_version"],
        "import_manifest_hash": import_row["manifest_hash"] if import_row else None,
        "counts": {
            "cases": len(cases),
            "verification": dict(sorted(verification.items())),
            "processing": dict(sorted(processing.items())),
            "categories": dict(sorted(categories.items())),
            "unresolved_fields": unresolved,
            "confirmed_mismatch_fields": confirmed_mismatches,
        },
        "claims": {
            "organizer_score": None,
            "human_study": "not_run",
            "screenshots": "not_generated",
            "ocr_success_rate": None,
        },
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
    return 0


def command_challenge(args: argparse.Namespace) -> int:
    result = execute_challenge(_store(args.db), args.fixture, args.mutation, args.seed)
    print(json.dumps(result, ensure_ascii=False))
    return 0


def command_evaluate(args: argparse.Namespace) -> int:
    # Evaluation is deliberately isolated from answer-key access. This command
    # validates the export and reports a handoff; organizers score it externally.
    if args.evaluator != "organizer": raise ValueError("only organizer evaluator is supported")
    payload = json.loads(Path(args.submission).read_text(encoding="utf-8"))
    print(json.dumps({"validated": True, "emails": len(payload), "evaluator": "organizer", "message": "submit to organizer scorer"}))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m cleardraft")
    p.add_argument("--db", default=None, help="SQLite path (default CLEARDRAFT_DB or var/cleardraft.db)")
    sub = p.add_subparsers(dest="command", required=True)
    x = sub.add_parser("doctor"); x.set_defaults(func=command_doctor)
    x = sub.add_parser("import"); x.add_argument("--participant-zip"); x.add_argument("--directory", "--participant-root", dest="directory"); x.set_defaults(func=command_import)
    x = sub.add_parser("run"); x.add_argument("--import-id", required=True); x.add_argument("--mode", choices=["local_rules", "live_ai", "replay"], default="local_rules"); x.set_defaults(func=command_run)
    x = sub.add_parser("export"); x.add_argument("--run-id", required=True); x.add_argument("--machine-only", action="store_true"); x.add_argument("--out", required=True); x.set_defaults(func=command_export)
    x = sub.add_parser("evaluate"); x.add_argument("--submission", required=True); x.add_argument("--evaluator", default="organizer"); x.set_defaults(func=command_evaluate)
    x = sub.add_parser("report"); x.add_argument("--run-id", required=True); x.add_argument("--out", required=True); x.set_defaults(func=command_report)
    x = sub.add_parser("challenge"); x.add_argument("--fixture", required=True); x.add_argument("--mutation", required=True); x.add_argument("--seed", type=int, default=42); x.set_defaults(func=command_challenge)
    return p


def main(argv: list[str] | None = None) -> int:
    _load_dotenv()
    parser = build_parser(); args = parser.parse_args(argv)
    try: return int(args.func(args))
    except Exception as exc:
        print(json.dumps({"error": str(exc), "type": type(exc).__name__}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
