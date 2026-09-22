# VPS Deployment

This runbook describes how to push a fixed ClearDraft release to the current
VPS without losing the imported inbox, cases, or document evidence.

Current production layout:

- App directory: `/root/cleardraft`
- Production Compose file: `/root/cleardraft/docker-compose.vps.yml`
- Persistent volume: `cleardraft_cleardraft-data`
- Public URL: `https://cleardraft.kianlok.top`
- Existing reverse proxy: `n8n-caddy-1`

Do not start a second Caddy container. ClearDraft API and web containers
join the existing `n8n_default` network.

## Configuration

`.env.production` is deployment metadata only:

    VPS_HOST=...
    VPS_USER=...
    VPS_PORT=22
    SSH_KEY_PATH=C:\path\to\key
    DOMAIN=cleardraft.kianlok.top

The application runtime secrets stay in `.env`. Never commit either file or
include them in a source archive. The VPS runtime file is
`/root/cleardraft/.env` and should have mode `600`.

## Push a code fix

Use this path for frontend, API, worker, or Dockerfile changes. It preserves
the production database volume.

### 1. Stage the source

Run from the repository root in PowerShell. This archive includes the public
participant bundle, but excludes secrets, databases, dependencies, build
output, and the private organizer evaluator.

    $stage = Join-Path $env:TEMP "cleardraft-deploy"
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    New-Item -ItemType Directory -Path $stage | Out-Null

    $sources = @('apps\api','apps\worker','apps\web','src','tests','scripts','docs','sdoc-hackathon-bundle')
    foreach ($source in $sources) {
      $destination = Join-Path $stage $source
      New-Item -ItemType Directory -Path $destination -Force | Out-Null
      robocopy (Join-Path (Get-Location) $source) $destination /E /NFL /NDL /NJH /NJS /NP /XD (Join-Path (Get-Location) 'apps\web\node_modules') (Join-Path (Get-Location) 'apps\web\.next') (Join-Path (Get-Location) 'apps\web\dist') | Out-Null
      if ($LASTEXITCODE -gt 7) { throw "robocopy failed: $source" }
    }

    $rootFiles = @('docker-compose.yml','README.md','pyproject.toml','uv.lock','IMPLEMENTATION_PLAN.md','.dockerignore','.gitignore','.env.example')
    foreach ($file in $rootFiles) { Copy-Item -LiteralPath $file -Destination (Join-Path $stage $file) -Force }

    $archive = Join-Path $env:TEMP 'cleardraft-source.tar'
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    tar -cf $archive -C $stage .

Do not include `.env`, `.env.production`, `var`, `artifacts`, or
`sdoc-hackathon-docker`.

### 2. Upload and extract

Load the deployment values without printing them:

    $deploy = Get-Content .env.production | ConvertFrom-StringData
    scp -i $deploy.SSH_KEY_PATH -P $deploy.VPS_PORT "$archive" "$($deploy.VPS_USER)@$($deploy.VPS_HOST):/root/cleardraft-source.tar"
    ssh -i $deploy.SSH_KEY_PATH -p $deploy.VPS_PORT "$($deploy.VPS_USER)@$($deploy.VPS_HOST)" "tar -xf /root/cleardraft-source.tar -C /root/cleardraft && rm -f /root/cleardraft-source.tar"

Extract over the existing source tree. Do not remove `/root/cleardraft`; it
contains the runtime `.env` and database backups.

### 3. Back up and rebuild

Back up the database before rebuilding. Never use `docker compose down -v` for
a normal release because `-v` deletes the persisted data volume.

    ssh -i $deploy.SSH_KEY_PATH -p $deploy.VPS_PORT "$($deploy.VPS_USER)@$($deploy.VPS_HOST)" "docker run --rm -v cleardraft_cleardraft-data:/data -v /root/cleardraft:/backup cleardraft-api sh -c 'cp /data/cleardraft.db /backup/cleardraft.db.before-update'"
    ssh -i $deploy.SSH_KEY_PATH -p $deploy.VPS_PORT "$($deploy.VPS_USER)@$($deploy.VPS_HOST)" "cd /root/cleardraft && docker compose -f docker-compose.vps.yml up -d --build"

This rebuilds API, worker, and web while retaining the named SQLite volume.

## One-time data migration

Use this only when a fresh VPS has an empty database and the correct local
data is in `var/cleardraft.db`. Do not repeat it for every code fix.

    scp -i $deploy.SSH_KEY_PATH -P $deploy.VPS_PORT .\var\cleardraft.db "$($deploy.VPS_USER)@$($deploy.VPS_HOST):/root/cleardraft/cleardraft.db.upload"
    ssh -i $deploy.SSH_KEY_PATH -p $deploy.VPS_PORT "$($deploy.VPS_USER)@$($deploy.VPS_HOST)" "cd /root/cleardraft && docker compose -f docker-compose.vps.yml stop api worker"
    ssh -i $deploy.SSH_KEY_PATH -p $deploy.VPS_PORT "$($deploy.VPS_USER)@$($deploy.VPS_HOST)" "docker run --rm -v cleardraft_cleardraft-data:/data -v /root/cleardraft:/backup cleardraft-api sh -c 'cp /data/cleardraft.db /backup/cleardraft.db.before-data-migration; cp /backup/cleardraft.db.upload /data/cleardraft.db; chmod 644 /data/cleardraft.db'"
    ssh -i $deploy.SSH_KEY_PATH -p $deploy.VPS_PORT "$($deploy.VPS_USER)@$($deploy.VPS_HOST)" "rm -f /root/cleardraft/cleardraft.db.upload && cd /root/cleardraft && docker compose -f docker-compose.vps.yml up -d api worker"

Keep `sdoc-hackathon-bundle/` in the deployment tree. The database references
source documents from that bundle.

## Caddy and DNS

The existing `/opt/n8n/Caddyfile` routes the domain as follows:

    cleardraft.kianlok.top {
        handle /api/* {
            reverse_proxy cleardraft-api:8000
        }
        handle {
            reverse_proxy cleardraft-web:5173
        }
    }

Only change Caddy when routing or the domain changes. Back up and validate
before reloading the existing container:

    cp /opt/n8n/Caddyfile /opt/n8n/Caddyfile.before-change
    docker exec n8n-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    docker exec n8n-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

The DNS `A` record for the domain must point to the VPS before HTTPS can be
issued.

## Verify every release

Run these checks after rebuilding:

    $base = "https://$($deploy.DOMAIN)"
    Invoke-WebRequest "$base/" -UseBasicParsing
    Invoke-RestMethod "$base/api/v1/health"
    Invoke-RestMethod "$base/api/v1/readiness"
    $cases = Invoke-RestMethod "$base/api/v1/cases"
    $imports = Invoke-RestMethod "$base/api/v1/imports"
    "cases=$($cases.Count) imports=$($imports.Count)"

Expected health responses are `{"status":"ok"}` and
`{"ready":true,"database":true}`. Cases and imports must not be empty for a
data-bearing deployment.

For a document-level check, use a document ID from a case detail response and
request both `/api/v1/documents/<id>/source` and
`/api/v1/documents/<id>/preview`; both should return HTTP 200.

On the VPS, confirm all services are up:

    cd /root/cleardraft
    docker compose -f docker-compose.vps.yml ps

The API should be `healthy`; web and worker should be `Up`.

## Rollback

For a code rollback, restore the previous source archive or known-good commit
and rerun `up -d --build`. Do not delete the named volume.

For a database rollback, stop API and worker, copy the preserved database
backup into `cleardraft_cleardraft-data` using the same `docker run -v` pattern
above, restart API and worker, and repeat the verification checks.
