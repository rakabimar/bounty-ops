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

Recon tools listed in `configs/tools.yaml` are not installed or executed by this local setup. Full worker job execution, expanded domain models, advanced authentication flows, and production Docker services will be added later.
