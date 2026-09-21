# Release checklist

- [ ] README quick start works on a clean machine.
- [x] `python -m cleardraft doctor` reports required and optional dependencies.
- [x] Import accounts for all 520 emails and 250 public attachments (`var/release.db` and doctor bundle check).
- [x] TXT, native PDF, scanned PDF/OCR, DOCX, XLSX, corrupt, and missing source
      paths are exercised (`tests/test_document_readers_and_sources.py`).
- [x] Every resolved field links to source evidence (audited 785/785 resolved fields in 520 cases).
- [x] Missing or ambiguous values cannot produce an automatic seven-field match.
- [x] Focused reader, API, recovery, duplicate-import, revision, and replay-boundary
      tests pass (`53 passed` in the local writable-temp run).
- [x] Review, revision, retry, stale-action, and worker-restart paths pass end to end
      (`tests/test_release_slice.py::test_review_revision_retry_stale_action_worker_restart_end_to_end`).
- [ ] Eight browser flows and empty/error states pass.
- [x] Export has exactly all known email IDs and validates against the strict
      organizer schema (520/520 in `artifacts/submission.json`).
- [x] Evaluator answer key is absent from app image, mounts, prompts, and tests
      (`scripts/doctor.py` isolation audit).
- [x] Baseline and challenge runs use fresh run/source hashes (`tests/test_challenges.py`).
- [x] Reports distinguish measured results, illustrative calculations, and
      pending human trials (`artifacts/run-report.json` claims block).
- [x] Dependency versions and relevant licenses are recorded.
- [x] Resolved `pip freeze` and `npm ls --all` outputs are archived with the
      release report (`artifacts/dependencies/`).
