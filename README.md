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
