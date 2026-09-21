# Local setup and clean-machine rehearsal

ClearDraft is designed for a single local machine. The default mode uses local
rules and never sends source documents outside the process. The optional live
provider is explicit and must be configured by the operator.

## Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer and npm
- Docker Desktop with Compose v2 (optional)
- Tesseract OCR executable plus `eng` language data for scanned PDFs (optional;
  the doctor reports when it is unavailable)

Create an isolated environment and install the locked project dependencies:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e .[dev]
Copy-Item .env.example .env
python -m cleardraft doctor
```

The UI dependencies are installed in `apps/web` once that workspace exists:

```powershell
cd apps/web
npm ci
cd ../..
```

Run the native services in two terminals:

```powershell
$env:PYTHONPATH = "src"
python -m uvicorn cleardraft.api:app --reload --host 127.0.0.1 --port 8000
```

```powershell
npm --prefix apps/web run dev -- --host 127.0.0.1
```

The Vite client uses the local API adapter during development. For a
single-command startup and the persisted volume, use Compose instead.

## Import and process the supplied bundle

Use a participant directory or ZIP. The importer checks archive paths before
materializing files, preserves missing attachment references, and records a
manifest hash. A second import of identical bytes reuses the manifest.

```powershell
python -m cleardraft import --participant-root .\sdoc-hackathon-bundle
python -m cleardraft run --import-id <id> --mode local_rules
python -m cleardraft export --run-id <id> --machine-only --out .\artifacts\submission.json
```

The generated submission must contain exactly one entry for each original
`email_id` and only the five fields required by the organizer schema.

## Compose launch

```powershell
Copy-Item .env.example .env
docker compose up --build
```

The `api`, `worker`, and `web` services share a named data volume. The
participant bundle is mounted read-only at `/inputs/participant`. The optional
`organizer` profile is deliberately separate and is not mounted into the
application services.

To reset local runtime state explicitly, stop Compose and remove the named
volume:

```powershell
docker compose down
docker volume rm cleardraft_cleardraft-data
```

This is destructive and should only be used when a clean rehearsal is desired.

## No-credential mode

`PROCESSING_MODE=local_rules` and `LLM_PROVIDER=none` are supported. Live AI
mode fails clearly if the configured provider credential is absent; it never
silently falls back while labeling a run as live AI.

For the optional DeepSeek adapter, set `DEEPSEEK_KEY` (and optionally
`DEEPSEEK_MODEL`/`DEEPSEEK_BASE_URL`) in `.env`, then select `--mode live_ai`.
The key is read server-side only and is never included in run provenance.

The current live adapter reads `DEEPSEEK_KEY` (or `DEEPSEEK_API_KEY`), with
optional `DEEPSEEK_BASE_URL` and `DEEPSEEK_MODEL`. Keep these values in the
local `.env`; never commit them or place them in browser configuration.
