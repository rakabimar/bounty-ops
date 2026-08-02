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
