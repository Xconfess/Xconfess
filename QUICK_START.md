# xConfess — Quick Start

Get the full stack running locally in under 5 minutes.

## Prerequisites

| Tool | Version | Required for |
|------|---------|-------------|
| Node.js | 22.x | Backend + Frontend |
| npm | >= 9 | Root workspace and all JS packages |
| Docker | any | Postgres + Redis |
| Rust + cargo | stable | Contracts only — skip if not touching contracts |

## Step 1 — Clone the repo

```bash
git clone https://github.com/Dataguru-tech/Xconfess.git
cd Xconfess
```

## Step 2 — Install dependencies

```bash
# Root workspace dependencies
npm install
npm run setup:check
```

## Step 3 — Start infrastructure (Postgres + Redis)

```bash
npm run dev:services

# Verify both containers are healthy
docker compose -f compose.yaml ps
```

Postgres runs on **localhost:55432**, Redis on **localhost:6379**.
If Docker Desktop is closed or still starting, `npm run dev:services` stops before Compose and prints the short fix for your platform. If containers show `starting`, wait a few seconds and rerun `docker compose -f compose.yaml ps`.

## Step 4 — Configure environment files

```bash
npm run env:bootstrap
```

On Windows, if PowerShell blocks `npm.ps1`, run the same commands through `npm.cmd`, for example `npm.cmd install` and `npm.cmd run env:bootstrap`.

Minimum backend keys to set in `xconfess-backend/.env`:

| Key | What to put |
|-----|------------|
| `JWT_SECRET` | `local-dev-jwt-secret-change-me-32-chars-minimum` |
| `APP_SECRET` | `local-dev-app-secret-change-me-32-chars-minimum` |
| `CONFESSION_ENCRYPTION_KEY` | `0000000000000000000000000000000000000000000000000000000000000001` |
| `ENCRYPTION_CURRENT_KEY_VERSION` | `v1` |
| `ENCRYPTION_MASTER_KEY_v1` | `0000000000000000000000000000000000000000000000000000000000000002` |

Copy-paste-safe local dummy values (local dev only):

```env
JWT_SECRET=local-dev-jwt-secret-please-replace-with-32-plus-chars
APP_SECRET=local-dev-app-secret-please-replace-with-32-plus-chars
CONFESSION_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
ENCRYPTION_CURRENT_KEY_VERSION=v1
ENCRYPTION_MASTER_KEY_v1=0000000000000000000000000000000000000000000000000000000000000000
```

These examples are valid local placeholders, but they are not secure production secrets. Do not reuse them outside local development.

All other values have safe defaults for local use. Frontend `.env.local` works out of the box with no changes.

> **Never commit .env or .env.local files.** Only .env.example files belong in source control. These sample secret values are local-only and must not be reused in shared environments.

## Step 5 — Seed demo data (optional)

```bash
npm run seed
```

Creates 5 users (password: `password123`), 20 confessions, 50 reactions, 20 comments, and 3 reports. Safe to re-run.

## Step 6 — Start the dev servers

```bash
npm run dev
```

This starts backend and frontend concurrently. Once ready:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Health check | http://localhost:5000/api/health/live |
| Swagger docs | http://localhost:5000/api/api-docs |
| Postgres | localhost:55432 |
| Redis | localhost:6379 |

## Troubleshooting

**Backend won't start** — check that Postgres and Redis containers are healthy (`docker compose -f compose.yaml ps`) and that `.env` has all required keys set. A container can be running before it is ready to accept connections.

**Frontend auth loop** — add `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` to `xconfess-frontend/.env.local` to skip the auth flow during UI-only development.

**Port conflicts** — Postgres uses 55432 (not 5432) to avoid clashing with a local Postgres install.

## Running tests

```bash
# Backend unit tests
npm run backend:test

# Frontend tests
npm run frontend:test

# Full CI check (build + lint + test for all packages)
npm run ci
```

For the full reference including contract builds and individual service scripts, see the [README](./README.md).
