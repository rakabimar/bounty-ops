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
docker compose -f infra/docker-compose.local.yml up -d
```

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
pnpm db:studio
```

Recon tools listed in `configs/tools.yaml` are not installed or executed by this local setup. Full worker job execution, authentication, the complete Prisma schema, and production Docker services will be added later.
