"""Environment and input doctor for ClearDraft.

The doctor is deliberately dependency-light so it can run before installing the
full application. It validates public input shape, optional readers, OCR
availability, and evaluator isolation without opening private answer data.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = ROOT / "sdoc-hackathon-bundle"


def _check(name: str, ok: bool, detail: str) -> tuple[str, bool, str]:
    return name, bool(ok), detail


def inspect_public_bundle(root: Path = PUBLIC_ROOT) -> list[tuple[str, bool, str]]:
    inbox = root / "inbox"
    attachments = root / "attachments"
    results: list[tuple[str, bool, str]] = []
    results.append(_check("participant root", root.is_dir(), str(root)))
    results.append(_check("inbox directory", inbox.is_dir(), str(inbox)))
    results.append(_check("attachments directory", attachments.is_dir(), str(attachments)))
    if inbox.is_dir():
        files = sorted(inbox.glob("*.json"))
        valid = 0
        for path in files:
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(value, dict) and isinstance(value.get("email_id"), str):
                    valid += 1
            except (OSError, UnicodeError, json.JSONDecodeError):
                continue
        results.append(_check("inbox records", len(files) == 520, f"{len(files)} files; {valid} valid JSON records (expected 520)"))
    if attachments.is_dir():
        files = [p for p in attachments.rglob("*") if p.is_file()]
        results.append(_check("attachment files", len(files) == 250, f"{len(files)} files (expected 250)"))
        ext_counts: dict[str, int] = {}
        for path in files:
            ext_counts[path.suffix.lower() or "<none>"] = ext_counts.get(path.suffix.lower() or "<none>", 0) + 1
        results.append(_check("supported formats", set(ext_counts).issubset({".txt", ".pdf", ".docx", ".xlsx"}), str(ext_counts)))
    return results


def inspect_environment() -> list[tuple[str, bool, str]]:
    results: list[tuple[str, bool, str]] = []
    results.append(_check("python", sys.version_info >= (3, 11), sys.version.split()[0]))
    # PyMuPDF has used both ``pymupdf`` and ``fitz`` as import names across
    # supported releases.  Check either name, but report the distribution by
    # its actual package name so a healthy install is not marked missing.
    required_modules = {
        "fastapi": ("fastapi",),
        "pydantic": ("pydantic",),
        "PyMuPDF": ("pymupdf", "fitz"),
        "python-docx": ("docx",),
        "openpyxl": ("openpyxl",),
    }
    for package, modules in required_modules.items():
        available = next((module for module in modules if importlib.util.find_spec(module) is not None), None)
        found = available is not None
        detail = f"installed ({available})" if found else "missing"
        if package == "PyMuPDF" and not found:
            detail += "; install PyMuPDF for PDF text/geometry"
        results.append(_check(f"python package: {package}", found, detail))
    tesseract = shutil.which("tesseract")
    results.append(_check("tesseract (optional OCR)", bool(tesseract), tesseract or "not found; scanned PDFs will remain reviewable"))
    results.append(_check("node (web build)", shutil.which("node") is not None, shutil.which("node") or "not found"))
    results.append(_check("docker (optional Compose)", shutil.which("docker") is not None, shutil.which("docker") or "not found"))
    return results


def inspect_isolation(root: Path = ROOT) -> list[tuple[str, bool, str]]:
    """Check release rules without reading any answer-key contents."""

    results: list[tuple[str, bool, str]] = []
    ignored = (root / ".gitignore").read_text(encoding="utf-8") if (root / ".gitignore").exists() else ""
    docker_ignored = (root / ".dockerignore").read_text(encoding="utf-8") if (root / ".dockerignore").exists() else ""
    results.append(_check("git ignores answer key", "**/ground_truth.json" in ignored, "pattern present"))
    results.append(_check("docker ignores answer key", "**/ground_truth.json" in docker_ignored, "pattern present"))
    results.append(_check("docker excludes source archives", "sdoc-hackathon-docker" in docker_ignored and "sdoc-hackathon-bundle" in docker_ignored, "runtime inputs are mounted read-only"))
    compose = (root / "docker-compose.yml").read_text(encoding="utf-8") if (root / "docker-compose.yml").exists() else ""
    # The opt-in organizer profile may mount its public evaluator package, but
    # the application services must never mention the private answer key.
    application_services = compose.split("  organizer:", 1)[0]
    app_mounts_private = "ground_truth.json" not in application_services and "./sdoc-hackathon-bundle:/inputs/participant:ro" in application_services
    results.append(_check("app services do not mount evaluator key", app_mounts_private, "participant is the only application input; organizer is opt-in"))
    return results


def run(root: Path = ROOT) -> int:
    checks = inspect_environment() + inspect_public_bundle(root / "sdoc-hackathon-bundle") + inspect_isolation(root)
    failed = 0
    print("ClearDraft environment doctor")
    for name, ok, detail in checks:
        marker = "OK" if ok else "FAIL"
        print(f"[{marker:4}] {name}: {detail}")
        # OCR, Node, and Docker are optional for the native local-rules path.
        if not ok and "(optional" not in name:
            failed += 1
    print(f"\n{len(checks) - failed}/{len(checks)} checks passed")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit machine-readable check results")
    args = parser.parse_args()
    checks = inspect_environment() + inspect_public_bundle() + inspect_isolation()
    if args.json:
        print(json.dumps([{"name": n, "ok": ok, "detail": d} for n, ok, d in checks], indent=2))
        return 1 if any(not ok and "(optional" not in name for name, ok, _ in checks) else 0
    return run()


if __name__ == "__main__":
    raise SystemExit(main())
