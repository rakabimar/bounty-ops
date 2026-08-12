# BountyOps

BountyOps is a local-first bug bounty operations workspace for managing programs, assets, recon jobs, scoring, and manual review. This monorepo keeps the existing frontend, REST API starter, background worker starter, shared TypeScript contracts, Prisma database package, configuration, and local infrastructure together.

## Requirements

- Node.js 22 recommended
- pnpm 9
- Docker with Docker Compose

## Project structure

```text
apps/
  web/       Existing Lovable/TanStack frontend
  api/       Fastify REST API starter
  worker/    Background worker starter
packages/
  shared/    Shared TypeScript types, constants, and schemas
  db/        Prisma schema and client
configs/     Scoring, checklist, and tool configuration
infra/       Local and production Docker Compose files
data/        Local service data, artifacts, logs, and wordlists
```

## Local setup

```sh
corepack enable
corepack prepare pnpm@9.0.0 --activate
cp .env.example .env
pnpm install
docker compose --env-file .env -f infra/docker-compose.local.yml up -d
```

The root `.env` is the single environment file for local development. The web,
API, worker, Prisma CLI commands, and Prisma client all load it from the
repository root, and Docker Compose uses it for local service ports and
PostgreSQL credentials. Workspace-local `.env` copies are not required. Keep
`DATABASE_URL` aligned with the `POSTGRES_*` values and `POSTGRES_PORT`.

Run each application in its own terminal:

```sh
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

The frontend is available at <http://localhost:5173>. Check the API at <http://localhost:3000/health>.

## Database commands

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm db:studio
```

## Phase 1 verification

Run these commands from the repository root:

```sh
cp .env.example .env
pnpm install
docker compose --env-file .env -f infra/docker-compose.local.yml up -d
pnpm --filter @bountyops/db db:migrate
pnpm --filter @bountyops/db db:seed
pnpm dev:api
curl http://localhost:3000/health
pnpm dev:worker
```

The API health response should report `status: "ok"` and `database: "ok"`.
The worker should print `BountyOps worker started` followed by
`Redis connection: ok`. The explicit Compose `--env-file .env` flag keeps the
root `.env` as the single configuration source; `pnpm infra:up` is an equivalent
shortcut.

## Phase 2 core API

Start the local services, synchronize the database, seed the admin, and run the
API:

```sh
pnpm infra:up
pnpm --filter @bountyops/db db:migrate
pnpm --filter @bountyops/db db:seed
pnpm dev:api
```

Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the root `.env`. The
cookie jar is reused by the protected requests below:

```sh
curl -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@example.com","password":"bountyops"}'

curl -b cookies.txt http://localhost:3000/me
```

Create and list programs:

```sh
curl -b cookies.txt -X POST http://localhost:3000/programs \
  -H "content-type: application/json" \
  -d '{"platform":"hackerone","name":"Acme Corp","handle":"acme","status":"active","huntingStatus":"ongoing"}'

curl -b cookies.txt http://localhost:3000/programs
```

Use the returned program ID for the remaining examples:

```sh
curl -b cookies.txt -X POST http://localhost:3000/programs/PROGRAM_ID/scopes \
  -H "content-type: application/json" \
  -d '{"asset":"*.example.com","assetType":"wildcard_domain","isInScope":true,"bountyEligible":true}'

curl -b cookies.txt -X PUT http://localhost:3000/programs/PROGRAM_ID/rules \
  -H "content-type: application/json" \
  -d '{"automationAllowed":"limited","aggressiveAllowed":false,"rateLimitRps":3,"maxConcurrency":2,"forbiddenActions":["dos"],"authTestingAllowed":false,"dosTestingAllowed":false}'

curl -b cookies.txt -X POST http://localhost:3000/programs/PROGRAM_ID/headers \
  -H "content-type: application/json" \
  -d '{"name":"X-Bug-Bounty","value":"researcher-handle","isRequired":true}'

curl -b cookies.txt http://localhost:3000/programs/PROGRAM_ID
curl -b cookies.txt -X POST http://localhost:3000/notifications/test-telegram
```

The Telegram test returns a clear `400` error until a bot token and chat ID are
configured through `/settings` or the root `.env`. Header values and Telegram
tokens are plaintext for local development only; encryption at rest is planned
before production use.

## Phase 3 frontend integration

The frontend uses the Phase 2 API for authentication, programs, scopes, rules,
required headers, settings, Telegram testing, and audit logs. Configure the web
transport in the root `.env` (Vite loads the centralized root environment):

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_API_MODE=http
```

The same variables are documented in `apps/web/.env.example`. Set
`VITE_API_MODE=mock` to retain the generated local mock workflows. Recon jobs,
asset inventory, URLs, endpoints, and scanner detail pages remain mock-backed
until later phases.

Start the integrated local stack in separate terminals:

```sh
pnpm infra:up
pnpm --filter @bountyops/db db:migrate
pnpm --filter @bountyops/db db:seed
pnpm dev:api
pnpm dev:web
```

Open <http://localhost:5173> and sign in with `ADMIN_EMAIL` and
`ADMIN_PASSWORD` from the root `.env`. The API JWT is held only in the
`bountyops_session` httpOnly cookie; the frontend does not store the token or
password in browser storage. Core pages show API loading/error states, and the
Audit Logs page is available under System navigation.

Recon tools listed in `configs/tools.yaml` are not installed or executed by this local setup. Full worker job execution, expanded domain models, advanced authentication flows, and production Docker services will be added later.

## Phase 4 Scope Guard

Scope Guard is the fail-closed policy decision layer that future recon jobs must
call before doing work. It returns `allowed`, `limited`, or `blocked` together
with normalized target data, matching scope IDs, required headers, effective
rate/concurrency limits, stage permissions, and human-readable reasons. Every
preflight is persisted and added to the audit log. Phase 4 does not execute a
tool or enqueue a worker job.

Matching is conservative:

- `wildcard_domain` matches descendants such as `api.example.com`, but not the
  apex `example.com` or lookalikes such as `evil-example.com`.
- `domain` and `subdomain` are exact-host matches.
- `url` is scheme/origin sensitive and matches only the configured path prefix.
- `api` follows URL rules for URL-like values and exact-host rules otherwise.
- CIDR matching uses `ipaddr.js`; invalid CIDR rules never allow a target.
- Any matching out-of-scope rule wins over an in-scope match.

After logging in and saving the cookie as shown in Phase 2, request a summary:

```sh
curl -b cookies.txt \
  http://localhost:3000/programs/PROGRAM_ID/scope-guard/summary
```

Run an ordinary preflight and an out-of-scope preflight:

```sh
curl -b cookies.txt -X POST http://localhost:3000/scope-guard/preflight \
  -H "content-type: application/json" \
  -d '{"programId":"PROGRAM_ID","target":"api.example.com","jobType":"http_probe"}'

curl -b cookies.txt -X POST http://localhost:3000/scope-guard/preflight \
  -H "content-type: application/json" \
  -d '{"programId":"PROGRAM_ID","target":"admin.example.com","jobType":"http_probe"}'
```

Manual-approval jobs remain blocked until the approval flag is explicit:

```sh
curl -b cookies.txt -X POST http://localhost:3000/scope-guard/preflight \
  -H "content-type: application/json" \
  -d '{"programId":"PROGRAM_ID","target":"api.example.com","jobType":"nmap_verification","manualApproved":true}'
```

Bulk preflight accepts up to 100 targets and applies the same policy and audit
behavior to each result:

```sh
curl -b cookies.txt -X POST \
  http://localhost:3000/programs/PROGRAM_ID/scope-guard/bulk-preflight \
  -H "content-type: application/json" \
  -d '{"targets":["api.example.com","other.com"],"jobType":"http_probe"}'
```

## Phase 5 job queue foundation

Phase 5 connects the authenticated API, Postgres, the `recon-jobs` BullMQ
queue, and the worker. Every job is evaluated by Scope Guard before enqueue.
Blocked jobs are retained in Postgres for review but never enter Redis. Allowed
and limited jobs are consumed by the worker, which writes lifecycle status and
JSON logs back to Postgres.

All execution in this phase is simulated. The worker does not invoke subfinder,
httpx, nuclei, ffuf, or any other recon tool.

Start each application in its own terminal:

```sh
pnpm infra:up
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

After logging in and creating an active program with matching in-scope rules,
create a simulated HTTP probe:

```sh
curl -b cookies.txt -X POST http://localhost:3000/jobs \
  -H "content-type: application/json" \
  -d '{"programId":"PROGRAM_ID","type":"http_probe","target":"https://api.example.com","config":{},"manualApproved":false}'
```

Inspect queue health, jobs, a job detail, and its latest run logs:

```sh
curl -b cookies.txt http://localhost:3000/jobs/queue/health
curl -b cookies.txt http://localhost:3000/jobs
curl -b cookies.txt http://localhost:3000/jobs/JOB_ID
curl -b cookies.txt http://localhost:3000/jobs/JOB_ID/logs
```

Expected lifecycle statuses are `queued`, `running`, `success`, `failed`,
`cancelled`, and `blocked`. Manual-approval types require `manualApproved: true`.
The Recon Jobs page exposes the same simulated queue flow in HTTP mode; the
existing mock mode remains available.

## Phase 6 recon MVP

Phase 6 replaces simulation only for `subdomain_enum`, `dns_resolve`,
`http_probe`, and the first three stages of `full_deep_recon`. The worker uses
subfinder, dnsx, and httpx respectively. Every active target is checked again
against the program scope before execution; out-of-scope discoveries are never
passed to dnsx or httpx. Other job types remain explicitly simulated.

Install the ProjectDiscovery tools and ensure their binaries are in `PATH`:

```sh
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/dnsx/cmd/dnsx@latest
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
```

On Windows, add the Go bin directory (normally `%USERPROFILE%\go\bin`) to
`PATH`. Missing tools do not prevent the API or worker from starting: the job
and ToolRun fail with a clear tool-missing message. Check availability with:

```sh
curl -b cookies.txt http://localhost:3000/tools/health
```

Raw stdout/stderr are written under
`data/artifacts/{programId}/{jobRunId}/{toolName}/` and gzip-compressed after a
successful run. Parsed assets are available from `/assets`; DNS and HTTP detail
routes live under `/assets/:assetId`, and live services are available from
`/http-services`. The Asset Inventory and Live Hosts frontend pages use these
real endpoints in HTTP mode.

The safe automated smoke test never runs recon by default:

```sh
pnpm smoke:phase6
```

It checks tool availability, protected inventory endpoints, Scope Guard queue
blocking, and graceful missing-tool failure. Real recon runs only when you
explicitly provide a target you are authorized to test:

```sh
BOUNTYOPS_SMOKE_RECON_TARGET=authorized.example pnpm smoke:phase6
```

In PowerShell use `$env:BOUNTYOPS_SMOKE_RECON_TARGET="authorized.example"`
before running the command. Never set this variable to a target you do not own
or have explicit permission to assess. Phase 6 does not implement naabu,
katana, nuclei, ffuf, archive URL collection, secret scanning, or exploitation.

## Phase 7 categorization and scoring

Phase 7 turns stored recon metadata into a manual-review priority; it does not
run or add any recon tool. The worker evaluates assets and HTTP services against
[`configs/scoring-rules.yaml`](configs/scoring-rules.yaml), persists matched
rules as `ScoreEvent` history, and stores categories as entity classifications.
Reason tags make each score explainable.

Priority thresholds are `P1` at 15 or higher, `P2` from 8 through 14,
`Monitor` from 3 through 7, and `Low` at 2 or lower. Asset aggregation uses the
maximum related HTTP-service score, not a sum. A manual score from 0 to 100
overrides the automatic score until cleared; the automatic history remains.
Stable HTTP metadata also produces title and content fingerprints so duplicate
fingerprints can be surfaced without automatically ignoring them.

The Scoring Rules page edits YAML and calls the same evaluator used by the
worker for preview. The API validates the structure and regular expressions
before saving, then creates a timestamped
`configs/scoring-rules.backup.*.yaml`. Asset Inventory exposes category,
reason-tag, priority, minimum-score, and manual-override filters plus a real
“Why this score?” drawer. Manual Review lists actionable, in-scope assets.

After logging in, verify the API with:

```sh
curl -b cookies.txt "http://localhost:3000/assets?programId=PROGRAM_ID&minScore=8"
curl -b cookies.txt http://localhost:3000/assets/ASSET_ID/score-explanation
curl -b cookies.txt -X PATCH http://localhost:3000/assets/ASSET_ID/manual-score \
  -H "content-type: application/json" -d '{"manualScore":18}'
curl -b cookies.txt http://localhost:3000/scoring/rules
curl -b cookies.txt -X POST http://localhost:3000/scoring/preview \
  -H "content-type: application/json" \
  -d '{"entityType":"http_service","host":"api-staging.local.invalid","url":"https://api-staging.local.invalid/graphql","title":"GraphQL Playground","statusCode":200,"port":443,"technologies":["GraphQL","Express"]}'
curl -b cookies.txt "http://localhost:3000/manual-review/queue?programId=PROGRAM_ID&minScore=8"
```

`pnpm smoke:phase7` inserts only controlled `.invalid` records directly into
the local database, verifies scoring, explanations, overrides, and review
ordering, then removes the fixture. It performs no DNS, HTTP, or public-target
recon.

## Phase 8 detail workspaces

Phase 8 makes the Target, URL, Endpoint, and Scanner Finding detail workspaces
real-data backed in HTTP mode. Target detail includes DNS records, HTTP
services, related URLs, endpoints, scanner findings, changes, and its score
explanation. URL and endpoint workspaces include their relationships, status,
score events, and manual score overrides. Scanner findings are explicitly
review candidates, not confirmed vulnerabilities, and can be moved to the
`potential_bug` state for manual investigation.

The protected `POST /urls`, `POST /endpoints`, and `POST /scanner-findings`
routes provide manual/dev ingestion for smoke tests and local workflows until
later phases add authorized katana or nuclei ingestion. Each target-bearing
create request passes Scope Guard. Phase 8 adds no recon tools and runs no
scanner, crawler, DNS, or HTTP target request.

Useful detail requests after login include:

```sh
curl -b cookies.txt http://localhost:3000/assets/ASSET_ID
curl -b cookies.txt http://localhost:3000/assets/ASSET_ID/urls
curl -b cookies.txt http://localhost:3000/urls/URL_ID
curl -b cookies.txt http://localhost:3000/endpoints/ENDPOINT_ID
curl -b cookies.txt http://localhost:3000/scanner-findings/FINDING_ID
curl -b cookies.txt -X PATCH \
  http://localhost:3000/scanner-findings/FINDING_ID/status \
  -H "content-type: application/json" \
  -d '{"status":"potential_bug"}'
```

Run the repeatable local smoke test with:

```sh
pnpm smoke:phase8
```

The smoke test uses controlled database fixtures and Fastify request injection.
Although the fixture uses documentation-domain names, it performs no DNS,
HTTP, scanner, or other public-target recon and removes its temporary data.

## Phase 9 notes, checklist, and evidence workspace

Phase 9 adds a manual research workspace to assets, URLs, endpoints, scanner
findings, HTTP services, DNS records, and program-linked jobs. The four primary
detail pages expose real notes, generated and custom checklist items,
interesting request records, text/path/reference evidence, summary counts, and
tracked status transitions in HTTP mode. Mock mode remains available.

Checklist suggestions come from editable
[`configs/checklist-rules.yaml`](configs/checklist-rules.yaml). Rules match an
entity's categories and reason tags, and generation is idempotent: existing
automatic items are not duplicated and manual items are preserved. Interesting
requests capture compact request/response observations for later review.
Evidence records hold text, file paths, URLs, or references only; large binary
attachments are not stored in PostgreSQL. Audit entries contain identifiers and
titles, not evidence or request/response body contents.

Status changes create both `EntityStatusTransition` history and an
`EntityChange`. The UI and API use `potential_bug` / “Potential Bug”; a scanner
finding is not treated as a confirmed vulnerability. This workspace supports
manual research and does not create reports, execute exploits, or add recon
tools.

Examples after login:

```sh
curl -b cookies.txt -X POST http://localhost:3000/workspace/asset/ASSET_ID/notes \
  -H "content-type: application/json" \
  -d '{"title":"Auth observation","body":"Observed the login flow.","tags":["auth"]}'
curl -b cookies.txt -X POST http://localhost:3000/workspace/url/URL_ID/checklists/generate
curl -b cookies.txt -X PATCH http://localhost:3000/workspace/checklist-items/ITEM_ID \
  -H "content-type: application/json" -d '{"status":"done","evidenceRef":"evidence-1"}'
curl -b cookies.txt -X POST http://localhost:3000/workspace/endpoint/ENDPOINT_ID/interesting-requests \
  -H "content-type: application/json" \
  -d '{"method":"POST","url":"https://api.example.com/graphql","responseStatus":200,"notes":"Manual comparison candidate"}'
curl -b cookies.txt -X POST http://localhost:3000/workspace/scanner_finding/FINDING_ID/evidence \
  -H "content-type: application/json" \
  -d '{"title":"Response evidence","evidenceType":"request_response","content":"Redacted response excerpt"}'
curl -b cookies.txt -X PATCH http://localhost:3000/workspace/scanner_finding/FINDING_ID/status \
  -H "content-type: application/json" -d '{"status":"potential_bug","reason":"Manual evidence warrants review"}'
curl -b cookies.txt http://localhost:3000/workspace/asset/ASSET_ID/summary
```

Run the no-network verification with:

```sh
pnpm smoke:phase9
```

The smoke test uses Fastify injection and controlled database fixtures, verifies
all four primary workspace entity types, confirms audit redaction, and performs
no DNS, HTTP, scanner, or public-target recon.

## Phase 10 URL collection, crawling, and safe scanner findings

Phase 10 adds real worker stages for historical URL collection (`gau` and
`waybackurls`), standard non-headless crawling (`katana`), and a restricted
`nuclei_safe` profile. Archive and crawl output is normalized into `Url`,
`ApiEndpoint`, and `EndpointParameter` records. Nuclei output is stored only as
`ScannerFinding` records with status `new`; it is not a confirmed vulnerability
and can become a Potential Bug only through manual review.

Every active target is checked by Scope Guard in the API and again in the
worker. Configured target arrays are all-or-nothing at enqueue time, discovered
out-of-scope URLs are discarded, and katana/nuclei receive required program
headers without persisting header values in ToolRun arguments or logs. Katana
headless mode is disabled. The nuclei profile allows only `exposure`,
`misconfig`, `takeover`, `tech`, and `panel` tags and explicitly excludes DoS,
brute-force, intrusive, fuzzing, destructive, RCE, CVE, and OOB behavior.

Install the Phase 10 tools and ensure the resulting binaries are in `PATH`:

```sh
go install github.com/lc/gau/v2/cmd/gau@latest
go install github.com/tomnomnom/waybackurls@latest
go install github.com/projectdiscovery/katana/cmd/katana@latest
go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
```

On Windows, ensure `%USERPROFILE%\go\bin` is in `PATH`. Missing tools are
reported by `/tools/health` and produce clear failed ToolRun/job records rather
than crashing the API or worker. Phase 10 still does not add ffuf, naabu,
headless crawling, secret scanning, exploit logic, or report automation.

Create jobs after logging in and saving the session cookie:

```sh
curl -b cookies.txt -X POST http://localhost:3000/jobs \
  -H "content-type: application/json" \
  -d '{"programId":"PROGRAM_ID","type":"url_archive","target":"authorized.example"}'
curl -b cookies.txt -X POST http://localhost:3000/jobs \
  -H "content-type: application/json" \
  -d '{"programId":"PROGRAM_ID","type":"crawl","target":"https://authorized.example","config":{"maxDepth":2,"maxUrls":200}}'
curl -b cookies.txt -X POST http://localhost:3000/jobs \
  -H "content-type: application/json" \
  -d '{"programId":"PROGRAM_ID","type":"nuclei_safe","target":"https://authorized.example"}'
```

Authorization and matching in-scope program rules are mandatory. The default
smoke test performs no DNS, HTTP, crawling, archive lookup, or scanner traffic:

```sh
pnpm smoke:phase10
```

Real URL-archive smoke is possible only when an explicit authorized target and
network opt-in are both supplied. Active katana/nuclei smoke requires a third
opt-in:

```sh
BOUNTYOPS_SMOKE_RECON_TARGET=authorized.example \
BOUNTYOPS_SMOKE_RECON_ALLOW_NETWORK=1 pnpm smoke:phase10

BOUNTYOPS_SMOKE_RECON_TARGET=https://authorized.example \
BOUNTYOPS_SMOKE_RECON_ALLOW_NETWORK=1 \
BOUNTYOPS_SMOKE_RECON_ALLOW_ACTIVE=1 pnpm smoke:phase10
```

In PowerShell, set these values with `$env:VARIABLE="value"`. Never enable the
network flags for a target you do not own or have explicit authorization to
assess.

## Phase 11 recon over time and scheduled recon

Phase 11 records a `ReconSnapshot` and stable, SHA-256-fingerprinted
observations for every real recon stage. A successful run is compared only with
the most recent successful snapshot for the same program, stage, target set,
and relevant tool profile. This produces domain-aware `EntityChange` records
for DNS/IP changes, HTTP status/title/technology changes, new assets, URLs,
endpoints and parameters, scanner-finding lifecycle changes, and scoring or
priority transitions.

Comparability is deliberately conservative. Failed, skipped, partial, missing-
tool, parse-failed, or materially different target-set runs are not used to
infer disappearance. Passive subdomain and historical URL stages only add
observations; one missing passive result never means an asset was removed.
Scanner findings that disappear from two comparable safe-profile snapshots are
described as “no longer observed,” not as remediated vulnerabilities.

Program Detail now provides Schedules and History tabs, and `/changes` shows
the persisted change timeline. A new schedule starts disabled by default and
offers Daily, Every 3 Days, Weekly, or Manual frequency. Both scheduled runs
and Run Now call the same job creation service as manual jobs, so every attempt
loads current scope/ROE and passes a fresh Scope Guard preflight before BullMQ
enqueue. A blocked schedule persists a blocked Job/JobRun and performs no
network work.

Important changes are persisted as pending `NotificationEvent` rows. The
Notifications page can review or ignore them, but Phase 11 never sends
Telegram messages; delivery is reserved for Phase 12. The configurable
`recon.snapshotRetentionDays` default is 90 days, but automatic snapshot
deletion is intentionally not enabled yet. Entity changes remain long-lived.

Examples after login:

```sh
curl -b cookies.txt -X POST http://localhost:3000/programs/PROGRAM_ID/schedules \
  -H "content-type: application/json" \
  -d '{"name":"Weekly Deep Recon","jobType":"full_deep_recon","enabled":false,"frequency":"weekly","timeOfDay":"03:00","timezone":"Asia/Jakarta","config":{}}'
curl -b cookies.txt http://localhost:3000/programs/PROGRAM_ID/schedules
curl -b cookies.txt -X POST http://localhost:3000/programs/PROGRAM_ID/schedules/SCHEDULE_ID/run-now
curl -b cookies.txt "http://localhost:3000/programs/PROGRAM_ID/recon-history?limit=50"
curl -b cookies.txt "http://localhost:3000/changes?programId=PROGRAM_ID&importance=high"
curl -b cookies.txt "http://localhost:3000/changes/summary?programId=PROGRAM_ID&period=7d"
curl -b cookies.txt "http://localhost:3000/recon-diffs?programId=PROGRAM_ID"
curl -b cookies.txt "http://localhost:3000/notification-events?programId=PROGRAM_ID&status=pending"
```

Run the repeatable verification with:

```sh
pnpm smoke:phase11
```

This smoke test uses Fastify injection plus controlled snapshot fixtures. It
verifies DNS, HTTP, URL, scanner-finding, score and priority diffs, failed-run
safety, timezone-aware schedule calculations, fresh Scope Guard enforcement,
notification persistence, and API history. It performs zero DNS, HTTP,
crawling, scanner, or other network recon and leaves no long-running process.

## Phase 12 Telegram notification delivery

Phase 12 keeps event detection separate from delivery:

```text
NotificationEvent -> preference evaluation -> notification-delivery queue
                  -> Telegram worker -> NotificationDelivery
```

Global settings decide whether BountyOps may use Telegram and hold the single
bot token/chat destination. Program preferences independently default to off
and select the channel, minimum importance (`low`, `medium`, `high`, or
`critical`), and event types. Both layers must allow an event before it is
queued. Tokens remain masked in API responses and are never put in BullMQ
payloads, audit metadata, or formatted messages.

Deliveries move through `queued`, `sending`, `delivered`, `failed`, or
`suppressed`. The `notification-delivery` BullMQ queue uses four attempts with
exponential backoff. Network errors, timeouts, HTTP 429, and HTTP 5xx retry;
permanent Telegram/configuration failures do not retry indefinitely. A unique
database constraint and deterministic queue job ID prevent duplicate Telegram
deliveries. Notification failures remain isolated and never change recon job
results.

Program Detail has a Notifications tab. The Notifications page shows masked
configuration status, queue health, persisted event/delivery state, attempts,
safe errors, ignore controls, and failed-delivery retry. Scanner messages say
only that a scanner finding was observed; they do not claim a confirmed
vulnerability.

Useful protected API requests include:

```sh
curl -b cookies.txt http://localhost:3000/programs/PROGRAM_ID/notification-preferences
curl -b cookies.txt -X PUT http://localhost:3000/programs/PROGRAM_ID/notification-preferences \
  -H "content-type: application/json" \
  -d '{"enabled":true,"telegramEnabled":true,"minImportance":"medium","eventTypes":["high_score_asset","graphql_discovered","job_failed"]}'
curl -b cookies.txt "http://localhost:3000/notification-deliveries?programId=PROGRAM_ID"
curl -b cookies.txt http://localhost:3000/notification-events/EVENT_ID/deliveries
curl -b cookies.txt -X POST http://localhost:3000/notification-events/EVENT_ID/retry
curl -b cookies.txt http://localhost:3000/notifications/queue/health
```

Run the API, combined recon/notification worker, and web app with
`pnpm dev:api`, `pnpm dev:worker`, and `pnpm dev:web`. A notification-only
worker is also available through
`pnpm --filter @bountyops/worker dev:notification-worker`.

The default smoke uses the in-process mock transport and performs zero Telegram
or public network requests:

```sh
pnpm smoke:phase12
```

An optional live check sends exactly one message only when valid Telegram
credentials are intentionally configured and explicit opt-in is present:

```sh
BOUNTYOPS_SMOKE_TELEGRAM_ALLOW_SEND=1 pnpm smoke:phase12
```

In PowerShell use
`$env:BOUNTYOPS_SMOKE_TELEGRAM_ALLOW_SEND="1"`. The live message is clearly
labeled `BountyOps Phase 12 live Telegram smoke test`.
