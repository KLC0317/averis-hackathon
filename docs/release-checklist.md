# Release checklist

- [ ] README quick start works on a clean machine.
- [ ] `python -m cleardraft doctor` reports required and optional dependencies.
- [ ] Import accounts for all 520 emails and 250 public attachments.
- [ ] TXT, native PDF, scanned PDF/OCR, DOCX, XLSX, corrupt, and missing source
      paths are exercised.
- [ ] Every resolved field links to source evidence.
- [ ] Missing or ambiguous values cannot produce an automatic seven-field match.
- [ ] Review, revision, retry, stale-action, and worker-restart paths pass.
- [ ] Eight browser flows and empty/error states pass.
- [ ] Export has exactly all known email IDs and validates against the strict
      organizer schema.
- [ ] Evaluator answer key is absent from app image, mounts, prompts, and tests.
- [ ] Baseline and challenge runs use fresh run/source hashes.
- [ ] Reports distinguish measured results, illustrative calculations, and
      pending human trials.
- [ ] Dependency versions and relevant licenses are recorded.
- [ ] Resolved `pip freeze` and `npm ls --all` outputs are archived with the
      release report.
