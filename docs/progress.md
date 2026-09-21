# Implementation progress

This file is updated as release phases complete. It records observed commands
and limitations; it does not claim benchmark performance that has not been run.

## Phase 0 — audit and setup

- Public inventory confirmed: 520 inbox records and 250 attachment files.
- Participant formats observed: TXT, PDF, DOCX, and XLSX.
- `.gitignore`, `.dockerignore`, and Compose mounts exclude evaluator answer
  data from the application build and runtime.
- `.env.example`, native setup, and the startup doctor are provided.

Validation command:

```text
python -m cleardraft doctor
pytest -q
npm --prefix apps/web run test
```

The repository now has focused reader, API, recovery, duplicate-input, revision,
replay-boundary, and artifact-contract tests. The web package exposes explicit
`typecheck` and `test` scripts; `scripts/run_all_checks.py` fails on required
checks instead of suppressing their exit codes. Environment-specific pytest
runs may need a writable temporary directory on Windows.

## Current status

The backend pipeline, readers, API routes, review transactions, source-mutating
challenge lab, and UI are implemented. The web client uses the API when it is
available and retains a clearly bounded fixture fallback for a clean-machine
visual rehearsal. Organizer scoring remains isolated and pending until an
export is submitted. Human-effort and business-savings measurements remain
pending until real reviewers run the instrumented workflow.

Latest local smoke rehearsal (`2026-09-20T14:51Z`): the participant directory
imported 520 emails and 250 attachments, local-rules processing completed 520
cases, the real `container-count-plus-one` challenge passed on changed source
bytes, and strict export validation accepted a deterministic 520-entry
submission. This is a local pipeline check; it is not an organizer score.

## Release evidence to add

- Locked dependency output and clean-machine startup log.
- Full import/run/export report with hashes.
- Reader and browser test report.
- Actual organizer score response, if an external evaluator is run.
- Challenge-lab report showing changed source bytes and fresh run IDs (covered by
  `scripts/run_all_checks.py` and `tests/test_challenges.py`).
