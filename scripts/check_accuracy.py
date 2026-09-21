"""Dev-only accuracy diagnostic against the organizer's private ground truth.

============================================================================
DEV-ONLY. NEVER DEPLOY. NOT IMPORTED BY THE APPLICATION.
============================================================================
This script is invoked manually, by a human, from a local checkout. It reads
`sdoc-hackathon-docker/data_v2/ground_truth.json`, which is the organizer's
private answer key. It must never be:
  - imported by anything under src/cleardraft (the running app must never
    have this file in its import graph - see docs/decisions.md ADR-002),
  - called from the API, the CLI, or any HTTP-reachable path,
  - bundled or run inside a hosted/deployed environment.
Both `sdoc-hackathon-docker/` and `**/ground_truth.json` are excluded from
git and from the Docker build context (see .gitignore / .dockerignore) - this
script does not change that boundary, it just gives you a manual way to look
at the same file the isolation rules keep out of the shipped product.

What it measures is a development-time diagnostic, not the organizer's
score. It never claims to be one - see the banner this script prints, and
docs/known_limitations.md.

Usage
-----
    # against an exported submission file (recommended - what you'd ship)
    python scripts/check_accuracy.py --submission artifacts/submission.json

    # also break down which fields are driving NEEDS_REVIEW/MISMATCH,
    # by reading full per-field results out of a local database
    python scripts/check_accuracy.py --submission artifacts/submission.json --db var/cleardraft.db

    # archive the same data as JSON (written under var/, already gitignored)
    python scripts/check_accuracy.py --submission artifacts/submission.json --json-out var/accuracy-report.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GROUND_TRUTH = ROOT / "sdoc-hackathon-docker" / "data_v2" / "ground_truth.json"
DEFAULT_SUBMISSION = ROOT / "artifacts" / "submission.json"

BANNER = """\
================================================================================
 DEV-ONLY DIAGNOSTIC - not the organizer's score, not run by the application.
 Reads the private ground truth manually, from your local checkout only.
 Never deploy this script. Never call it from the API or CLI. See the module
 docstring in scripts/check_accuracy.py for why.
================================================================================
"""


def split_of(email_id: str) -> str:
    """Stable, content-derived dev/blind split so the same 30/70 partition is
    used every time this script runs, and so a number can't be produced by
    accidentally tuning against the whole set at once."""
    digest = hashlib.sha256(email_id.encode()).hexdigest()[:8]
    return "dev" if int(digest, 16) % 10 < 3 else "blind"


def load_json(path: Path, label: str) -> dict[str, Any]:
    if not path.is_file():
        print(f"error: {label} not found at {path}", file=sys.stderr)
        print("       (this is expected in a deployed/hosted environment - this script is dev-only)", file=sys.stderr)
        raise SystemExit(2)
    return json.loads(path.read_text(encoding="utf-8"))


def load_field_detail(db_path: Path, email_ids: set[str]) -> dict[str, list[dict[str, Any]]]:
    """Best-effort: pull per-field state from the latest case per email_id, if
    a local database is supplied. Returns {} if unavailable - field-level
    breakdown is an enrichment, not a requirement of this script."""
    if not db_path.is_file():
        return {}
    db = sqlite3.connect(str(db_path))
    db.row_factory = sqlite3.Row
    out: dict[str, list[dict[str, Any]]] = {}
    try:
        rows = db.execute(
            "SELECT email_id, result_json FROM cases WHERE email_id IN "
            f"({','.join('?' for _ in email_ids)}) ORDER BY updated_at DESC",
            tuple(email_ids),
        ).fetchall()
    except sqlite3.OperationalError:
        return {}
    seen: set[str] = set()
    for row in rows:
        if row["email_id"] in seen:
            continue
        seen.add(row["email_id"])
        try:
            result = json.loads(row["result_json"] or "{}")
        except json.JSONDecodeError:
            continue
        out[row["email_id"]] = result.get("fields", [])
    return out


def bar(pct: float, width: int = 24) -> str:
    filled = round(pct / 100 * width)
    return "#" * filled + "-" * (width - filled)


def print_table(rows: list[tuple[str, ...]], headers: tuple[str, ...]) -> None:
    widths = [max(len(str(h)), *(len(str(r[i])) for r in rows)) if rows else len(str(h))
             for i, h in enumerate(headers)]
    line = "  ".join(h.ljust(w) for h, w in zip(headers, widths))
    print(line)
    print("-" * len(line))
    for r in rows:
        print("  ".join(str(c).ljust(w) for c, w in zip(r, widths)))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--submission", type=Path, default=DEFAULT_SUBMISSION,
                       help=f"exported submission JSON to score (default: {DEFAULT_SUBMISSION.relative_to(ROOT)})")
    parser.add_argument("--ground-truth", type=Path, default=DEFAULT_GROUND_TRUTH,
                       help="path to the organizer's ground_truth.json (default: the bundled copy)")
    parser.add_argument("--db", type=Path, default=None,
                       help="optional: a cleardraft.db to enrich with per-field breakdown")
    parser.add_argument("--json-out", type=Path, default=None,
                       help="optional: also write the full report as JSON (put it under var/, which is gitignored)")
    args = parser.parse_args()

    print(BANNER)

    ground_truth = load_json(args.ground_truth, "ground truth")
    submission = load_json(args.submission, "submission")

    common = sorted(set(ground_truth) & set(submission))
    gt_only = set(ground_truth) - set(submission)
    sub_only = set(submission) - set(ground_truth)
    if gt_only:
        print(f"warning: {len(gt_only)} email_id(s) in ground truth are missing from the submission")
    if sub_only:
        print(f"warning: {len(sub_only)} email_id(s) in the submission are not in ground truth (ignored)")
    print(f"\nscoring {len(common)} email_id(s) present in both files\n")

    per_split: dict[str, Counter] = {"dev": Counter(), "blind": Counter()}
    category_confusion: Counter = Counter()
    status_confusion: Counter = Counter()
    false_clears: list[str] = []
    false_mismatches: list[str] = []
    per_email: dict[str, dict[str, Any]] = {}

    for email_id in common:
        truth, ours = ground_truth[email_id], submission[email_id]
        split = split_of(email_id)
        c = per_split[split]
        c["n"] += 1

        cat_ok = truth.get("category") == ours.get("category")
        status_ok = truth.get("status") == ours.get("status")
        c["category_correct"] += cat_ok
        c["status_correct"] += status_ok
        c["exact_correct"] += cat_ok and status_ok

        if not cat_ok:
            category_confusion[(truth.get("category"), ours.get("category"))] += 1
        if not status_ok:
            status_confusion[(truth.get("status"), ours.get("status"))] += 1

        # The one failure mode this project treats as worse than any other:
        # a real defect that the submission reports as clean.
        if truth.get("status") != "OK" and ours.get("status") == "OK":
            false_clears.append(email_id)
            c["false_clears"] += 1
        # The inverse - a false alarm on a genuinely clean pair - costs review
        # time but never lets a real problem through; tracked separately.
        if truth.get("status") == "OK" and ours.get("status") == "MISMATCH":
            false_mismatches.append(email_id)

        per_email[email_id] = {
            "split": split, "truth_category": truth.get("category"), "our_category": ours.get("category"),
            "truth_status": truth.get("status"), "our_status": ours.get("status"),
            "category_correct": cat_ok, "status_correct": status_ok,
        }

    print("=" * 78)
    print("OVERALL")
    print("=" * 78)
    overall_rows = []
    for split in ("dev", "blind"):
        c = per_split[split]
        n = c["n"] or 1
        overall_rows.append((
            split, str(c["n"]),
            f"{c['category_correct']/n:6.1%}", f"{c['status_correct']/n:6.1%}",
            f"{c['exact_correct']/n:6.1%}", str(c["false_clears"]),
        ))
    total_n = sum(per_split[s]["n"] for s in per_split) or 1
    total_cat = sum(per_split[s]["category_correct"] for s in per_split)
    total_status = sum(per_split[s]["status_correct"] for s in per_split)
    total_exact = sum(per_split[s]["exact_correct"] for s in per_split)
    overall_rows.append((
        "ALL", str(total_n), f"{total_cat/total_n:6.1%}", f"{total_status/total_n:6.1%}",
        f"{total_exact/total_n:6.1%}", str(len(false_clears)),
    ))
    print_table(overall_rows, ("split", "n", "category acc", "status acc", "exact match", "false clears"))

    print(f"\ncategory accuracy  {bar(total_cat/total_n*100)} {total_cat/total_n:6.1%}")
    print(f"status accuracy    {bar(total_status/total_n*100)} {total_status/total_n:6.1%}")
    print(f"exact match        {bar(total_exact/total_n*100)} {total_exact/total_n:6.1%}")

    print("\n" + "=" * 78)
    print("CATEGORY CONFUSION (truth -> ours, mismatches only)")
    print("=" * 78)
    if category_confusion:
        print_table([(t, o, str(n)) for (t, o), n in category_confusion.most_common()],
                    ("truth", "ours", "count"))
    else:
        print("(none - every category call matched)")

    print("\n" + "=" * 78)
    print("STATUS CONFUSION (truth -> ours, mismatches only)")
    print("=" * 78)
    if status_confusion:
        print_table([(t, o, str(n)) for (t, o), n in status_confusion.most_common()],
                    ("truth", "ours", "count"))
    else:
        print("(none - every status call matched)")

    print("\n" + "=" * 78)
    print(f"FALSE CLEARS - {len(false_clears)} (truth had a real defect, we said OK)")
    print("=" * 78)
    if false_clears:
        for eid in false_clears:
            e = per_email[eid]
            print(f"  {eid}: truth={e['truth_category']}/{e['truth_status']}  ours={e['our_category']}/{e['our_status']}")
    else:
        print("  none - this is the number that matters most; keep it at zero.")

    print("\n" + "=" * 78)
    print(f"FALSE ALARMS - {len(false_mismatches)} (truth was OK, we said MISMATCH)")
    print("=" * 78)
    if false_mismatches:
        for eid in false_mismatches:
            print(f"  {eid}")
    else:
        print("  none")

    field_detail = load_field_detail(args.db, set(common)) if args.db else {}
    if field_detail:
        print("\n" + "=" * 78)
        print("FIELD-LEVEL BREAKDOWN (from --db, only for mismatched/incorrect emails)")
        print("=" * 78)
        field_state_counts: Counter = Counter()
        incorrect_ids = {eid for eid, e in per_email.items() if not e["status_correct"]}
        for eid in incorrect_ids:
            for f in field_detail.get(eid, []):
                field_state_counts[(f.get("field"), f.get("state"))] += 1
        if field_state_counts:
            print_table(
                [(field, state, str(n)) for (field, state), n in sorted(field_state_counts.items(), key=lambda x: -x[1])],
                ("field", "state", "count (in incorrect cases)"),
            )
        else:
            print("(no field-level detail found for the incorrect cases - db may be from a different run)")

    if args.json_out:
        report = {
            "artifact_type": "dev_accuracy_diagnostic",
            "warning": "development-time diagnostic against private ground truth - not the organizer's score",
            "submission_path": str(args.submission),
            "ground_truth_path": str(args.ground_truth),
            "overall": {
                "n": total_n, "category_accuracy": total_cat / total_n,
                "status_accuracy": total_status / total_n, "exact_match": total_exact / total_n,
                "false_clears": false_clears, "false_alarms": false_mismatches,
            },
            "per_split": {s: dict(per_split[s]) for s in per_split},
            "category_confusion": {f"{t}->{o}": n for (t, o), n in category_confusion.items()},
            "status_confusion": {f"{t}->{o}": n for (t, o), n in status_confusion.items()},
            "per_email": per_email,
        }
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nwrote JSON report to {args.json_out}")
        print("(this path should stay under var/ or another gitignored location - never commit it)")

    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
