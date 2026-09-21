"""Run the complete local ClearDraft verification suite in one command.

This is intentionally an orchestration script rather than a second test
framework. It runs the repository tests, frontend checks, API smoke, full
participant import/run/export, strict submission validation, and one optional
DeepSeek request using the existing .env credential. Secrets are never printed.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
NPM = "npm.cmd" if os.name == "nt" else "npm"


def load_env() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def run(label: str, command: list[str], *, cwd: Path = ROOT, check: bool = True) -> str:
    print(f"\n[{label}] {' '.join(command)}")
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src") + os.pathsep + env.get("PYTHONPATH", "")
    result = subprocess.run(command, cwd=cwd, env=env, text=True, capture_output=True)
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.returncode and result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    if check and result.returncode:
        raise RuntimeError(f"{label} failed with exit code {result.returncode}")
    return result.stdout.strip()


def parse_last_json(output: str) -> dict[str, object]:
    for line in reversed(output.splitlines()):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise RuntimeError("command did not emit a JSON object")


def api_smoke() -> None:
    sys.path.insert(0, str(ROOT / "src"))
    from cleardraft.api import create_app
    from fastapi.testclient import TestClient

    client = TestClient(create_app(str(ROOT / "var" / "api-check.db")))
    assert client.get("/api/v1/health").status_code == 200
    readiness = client.get("/api/v1/readiness")
    assert readiness.status_code == 200 and readiness.json().get("ready") is True
    print("API health/readiness: OK")


def live_smoke() -> None:
    key = os.getenv("DEEPSEEK_KEY") or os.getenv("DEEPSEEK_API_KEY")
    if not key:
        print("DeepSeek smoke: SKIPPED (no DEEPSEEK_KEY configured)")
        return
    sys.path.insert(0, str(ROOT / "src"))
    from cleardraft.providers import DeepSeekProvider

    # Keep the external-provider smoke test synthetic. The participant bundle
    # is processed locally below and is never sent to the provider.
    source = """SHIPPING INSTRUCTION
Shipper: Example Export Co.
Consignee: Example Import Co.
Notify Party: Example Notify Co.
Port of Loading: Port Klang, Malaysia
Port of Discharge: Rotterdam, Netherlands
Container Count: 2 x 40HC
Gross Weight (KG): 18420 KG
"""
    provider = DeepSeekProvider.from_environment()
    classification = provider.classify_email(
        "TO CONFIRM DOCS",
        "Attached are the SI and draft BL. Please check the details and confirm.",
    )
    extraction = provider.extract_fields("SI", source)
    assert classification["category"] in {"BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"}
    assert extraction["document_role"] == "SI" and len(extraction["fields"]) == 7
    print("DeepSeek smoke: OK (classification + seven-field extraction schema)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-live", action="store_true", help="skip the external-provider synthetic smoke")
    parser.add_argument("--live-only", action="store_true", help="run only the synthetic DeepSeek smoke")
    args = parser.parse_args()
    load_env()
    if args.live_only:
        live_smoke()
        print("LIVE CHECK PASSED")
        return 0
    check_root = ROOT / "var" / ("checks-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    check_root.mkdir(parents=True, exist_ok=True)
    db = check_root / "cleardraft.db"
    submission = check_root / "submission.json"

    run("python tests", [PYTHON, "-m", "pytest", "-q"])
    run("frontend typecheck", [NPM, "run", "test"], cwd=ROOT / "apps" / "web")
    run("frontend production build", [NPM, "run", "build"], cwd=ROOT / "apps" / "web")
    run("environment doctor", [PYTHON, "scripts/doctor.py"], check=False)
    api_smoke()

    imported = parse_last_json(run("full participant import", [PYTHON, "-m", "cleardraft", "--db", str(db), "import", "--directory", str(ROOT / "sdoc-hackathon-bundle")]))
    import_id = str(imported["import_id"])
    processed = parse_last_json(run("full local processing", [PYTHON, "-m", "cleardraft", "--db", str(db), "run", "--import-id", import_id, "--mode", "local_rules"]))
    run_id = str(processed["run_id"])
    challenge = parse_last_json(run("synthetic source challenge", [PYTHON, "-m", "cleardraft", "--db", str(db), "challenge", "--fixture", "email_001", "--mutation", "container-count-plus-one", "--seed", "42"]))
    if challenge.get("status") != "PASSED":
        raise RuntimeError("synthetic source challenge did not pass")
    run("strict export", [PYTHON, "-m", "cleardraft", "--db", str(db), "export", "--run-id", run_id, "--machine-only", "--out", str(submission)])
    run("submission validation", [PYTHON, "scripts/validate_submission.py", str(submission)])
    if args.skip_live:
        print("DeepSeek smoke: SKIPPED (--skip-live)")
    else:
        live_smoke()
    print(f"\nALL CHECKS PASSED\nArtifacts: {check_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
