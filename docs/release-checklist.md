# Release checklist

- [ ] README quick start works on a clean machine.
- [x] `python -m cleardraft doctor` reports required and optional dependencies.
- [ ] Import accounts for all 520 emails and 250 public attachments.
- [x] TXT, native PDF, scanned PDF/OCR, DOCX, XLSX, corrupt, and missing source
      paths are exercised (`tests/test_document_readers_and_sources.py`).
- [ ] Every resolved field links to source evidence.
- [x] Missing or ambiguous values cannot produce an automatic seven-field match.
- [x] Focused reader, API, recovery, duplicate-import, revision, and replay-boundary
      tests pass (`52 passed` in the local writable-temp run).
- [ ] Review, revision, retry, stale-action, and worker-restart paths pass end to end.
- [ ] Eight browser flows and empty/error states pass.
- [ ] Export has exactly all known email IDs and validates against the strict
      organizer schema.
- [ ] Evaluator answer key is absent from app image, mounts, prompts, and tests.
- [ ] Baseline and challenge runs use fresh run/source hashes.
- [ ] Reports distinguish measured results, illustrative calculations, and
      pending human trials.
- [x] Dependency versions and relevant licenses are recorded.
- [ ] Resolved `pip freeze` and `npm ls --all` outputs are archived with the
      release report (not run in this source-only slice).
