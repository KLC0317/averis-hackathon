# ClearDraft

ClearDraft is a local-first shipping-document review workspace for the SDOC
hackathon. It classifies a mixed inbox, reads Shipping Instructions (SI) and
draft Bills of Lading (BL), compares seven required fields, and keeps every
resolved value tied to source evidence. Missing, unreadable, or ambiguous
inputs remain visible as review work.

Classification runs through a three-tier gateway - deterministic rules, an
optional model second opinion, and human arbitration as the terminal tier -
rather than a single confidence threshold. When the deterministic rules and
the model disagree and neither carried a weak reading, neither is trusted
automatically: the case is handed to a person with the competing evidence and
the stated consequence of each answer, not just a flag. See
[`docs/architecture.md`](docs/architecture.md#the-classification-gateway) for
the design and [`docs/reliability.md`](docs/reliability.md) for two measured
regressions this exists to catch, including one that shipped briefly during
development and was caught by a held-out accuracy check before release.

The implementation follows [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
The participant bundle under `sdoc-hackathon-bundle/` is public input. The
organizer archive under `sdoc-hackathon-docker/` contains private evaluator
material and is isolated from application inference. Never copy or mount its
`data_v2/ground_truth.json` into the application.

## Quick start

### Native

```powershell
Copy-Item .env.example .env
python -m cleardraft doctor
python -m cleardraft import --participant-root .\sdoc-hackathon-bundle
```

Start the API and web development servers using the commands documented in
[`docs/setup.md`](docs/setup.md). Local rules run without model credentials;
selecting live AI mode requires the configured provider key.

### Docker Compose

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open `http://localhost:5173`. The optional organizer evaluator is a separate
profile and port: `docker compose --profile organizer up --build organizer`.

## Written responses

This section answers the written-response questions from the submission FAQ.
The claims below describe the current repository and local validation; planned
work is labeled as planned rather than presented as completed functionality.

### Problem-solution alignment

Shipping teams receive mixed email requests and document attachments, then
manually decide what each request means and compare Shipping Instructions (SI)
with draft Bills of Lading (BL). That workflow is slow and it is easy to miss
an attachment, accept an unreadable value, or lose the source for a decision.

ClearDraft addresses that problem by importing the inbox, classifying each
request, reading the documents independently, extracting seven required
fields, and comparing them with field-specific rules. Every resolved value is
linked to source evidence. Missing, unreadable, ambiguous, or conflicting
inputs become explicit review work instead of being silently cleared. A human
can revise a document pair, answer a targeted review question, inspect the
history, and export a strict machine-only result.

### AI and cloud infrastructure integration

The default processing mode is local and deterministic. It does not require a
model key and does not send source content to an external service. When
enabled, the optional `live_ai` mode uses the configurable DeepSeek provider
adapter for a second opinion on classification or unresolved extraction. The
same local schema validation, evidence checks, comparison rules, and human
arbitration still apply; the model is not allowed to invent source locations
or silently override a real disagreement.

The application is packaged with Docker Compose as a Next.js web client, a
FastAPI API, and a persisted worker sharing SQLite and an immutable local
storage volume. The Gmail mailbox screen performs a real, read-only IMAP
`EXAMINE`-mode retrieval against operator-supplied credentials, then runs the
retrieved mail through the same local-rules-first gateway as any other import
- it is a manual retrieval demo triggered from the UI, not a background cloud
sync or scheduled poller. This repository is therefore container-ready and
portable, but it is not claiming a hosted, multi-region, or managed-cloud
production deployment.

### User feedback and testing

The repository includes automated reader, API, review-transaction, duplicate
import, revision, worker-recovery, replay-boundary, export-contract, and
challenge-lab tests. The release record reports 57 focused tests passing and
eight browser flows covering review, empty, and error states. A local smoke
rehearsal imported the full public bundle, processed it, exported the result,
and validated the challenge mutation.

The UI also exposes source evidence, review history, retry/revision paths, and
editable draft text so a reviewer can verify the result rather than trusting a
single score. We have not run a statistically designed external user study or
measured production adoption yet. Human-effort and business-savings results
remain pending until real reviewers complete the instrumented workflow.

### Coding challenges and how they were handled

- **Evidence correctness:** values are extracted from SI and BL independently,
  validated against the literal source, and kept visible when a reader or OCR
  result is incomplete.
- **Model disagreement:** deterministic rules run first. A configured model is
  a second opinion; a disagreement where both sides have real evidence becomes
  a human arbitration case instead of an automatic guess.
- **Reproducibility and evaluator isolation:** the private organizer answer key
  is kept outside application inference, prompts, tests, and runtime mounts.
  Challenge runs mutate source bytes and create fresh run/source hashes.
- **Review consistency:** stale case versions, retries, worker restarts, and
  duplicate imports are handled through persisted state and bounded jobs so a
  page refresh does not erase evidence or review history.
- **Unreliable inputs:** TXT, PDF, scanned PDF/OCR, DOCX, XLSX, corrupt, and
  missing-source paths are tested. Unsupported or ambiguous inputs remain
  review work.
- **Learning from operator corrections without unreviewed drift:** a category
  correction becomes a candidate, not an immediate change; an operator must
  explicitly curate and promote candidates into an immutable, versioned
  few-shot set before they influence a future classification
  ([ADR-006](docs/decisions.md#adr-006-correction-guided-few-shot-prompting-instead-of-unreviewed-global-learning)).
  A taught field-level equivalence is stored and, on recurrence, surfaces as a
  one-click review aid generalized through the same normalization the
  comparison engine already trusts - never applied automatically
  ([ADR-007](docs/decisions.md#adr-007-operator-taught-comparison-equivalence-as-human-confirmed-review-aid)).
  This is correction-guided few-shot prompting and taught precedent, not
  reinforcement learning: there is no reward signal or weight update.

### Success metrics

Self-evaluation was run with the organizer-provided `score_cli.py` against the
private reference set in the local Docker bundle (`sdoc-hackathon-docker/`) -
the same self-check mechanism the hackathon brief describes, not the
organizers' own official leaderboard run:

- **Final score: 0.974** (30% Stage-1 classification + 20% Stage-3 defect
  detection + 50% end-to-end, per the brief's published weights).
- Stage 1 classification: **macro-F1 1.000** across all five categories
  (520/520 emails, zero misclassifications).
- Stage 3 defect detection: **defect-F1 0.978** (precision 1.000, recall
  0.957, exact field match 0.99).
- Reliability axis: **escalation recall 1.000** - every one of the 20 gold
  `NEEDS_REVIEW` cases was escalated, across all four review-reason categories
  (`wrong_doc_type`, `missing_attachment`, `unreadable`, `missing_value`).
- **Zero false clears**: of the 46 gold defect cases, the 2 the pipeline did
  not report as a defect were escalated to `NEEDS_REVIEW` rather than cleared
  as a match - none were silently accepted as `OK`.

Supporting local validation:

- 520 inbox records and 250 public attachments are inventoried and processed
  by the local pipeline.
- 785/785 resolved fields in the release audit have source evidence.
- Strict export validation accepts exactly 520/520 known email IDs.
- The `container-count-plus-one` challenge changes source bytes and produces a
  fresh run that detects the mutation.
- The release checklist records 23 counterparty cases with context-specific
  draft responses. The associated approximately 15.2-hour saving is an
  instrumented estimate, not the result of a completed human time study.

OCR success rate and statistically measured reviewer productivity beyond the
instrumented estimate above are not available yet and are intentionally not
claimed here.

### Scalability plans

The current target is reproducible single-host judging: one API, one worker,
SQLite, and a local immutable storage root. It is not a distributed or
multi-tenant production system today.

If this became a production service, the next steps would be to move metadata
to PostgreSQL, move source files and content-hash caches to object storage,
replace the single SQLite job table with a durable queue, run stateless API and
worker replicas, add tenant isolation and authentication, and enforce provider
rate limits and per-run budgets. Observability, retention controls, backup and
restore drills, and a calibrated held-out evaluation would be required before
claiming production scale.

## CLI contract

The application exposes the commands below. They return nonzero when input or
export validation fails, while valid unresolved cases remain explicit review
results.

```text
python -m cleardraft doctor
python -m cleardraft import --participant-zip ./inputs/participant.zip
python -m cleardraft run --import-id IMPORT_ID --mode local_rules
python -m cleardraft export --run-id RUN_ID --machine-only --out ./artifacts/submission.json
python -m cleardraft evaluate --submission ./artifacts/submission.json --evaluator organizer
python -m cleardraft challenge --fixture FIXTURE_ID --mutation container-count-plus-one --seed 42
python -m cleardraft report --run-id RUN_ID --out ./artifacts/run-report.json
```

## Verification

Run the release checks with `pytest`. The test suite validates the public input
inventory, strict submission contract, state/evidence invariants, and evaluator
isolation. Browser acceptance tests are documented separately and require the
running API and web services.

See [`docs/known_limitations.md`](docs/known_limitations.md) for constraints
that the source files cannot answer, and [`docs/benchmark_notes.md`](docs/benchmark_notes.md)
for the benchmark convention differences that must remain visible.
Resolved dependency and license recording guidance is in
[`docs/dependencies.md`](docs/dependencies.md).
