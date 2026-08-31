# xConfess

![CI](https://github.com/Dataguru-tech/Xconfess/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/github/license/Dataguru-tech/Xconfess)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)


xConfess is a monorepo for an anonymous confession platform built with NestJS, Next.js 16, PostgreSQL, Redis-backed queues, WebSockets, and Soroban smart contracts on Stellar.

## Repository Layout

- `xconfess-backend`: API, auth, moderation, notifications, data export, and Stellar integration
- `xconfess-frontend`: App Router UI, cookie-backed auth/session handling, proxy routes, and admin surfaces
- `xconfess-contracts`: Soroban Rust workspace for confession anchoring, tipping, and reputation-related contracts
- `compose.yaml`: local Postgres and Redis stack for development

## What This Repo Does Today

- anonymous confession feed and composer
- reactions, comments, and private messaging
- admin moderation, reports, analytics, and user management
- privacy settings, notifications, and profile flows
- Stellar anchoring, tipping, and contract invocation tooling
- audit logging and data export

## Reality Check

- The frontend does not use NextAuth.
- Auth is cookie/session based, with a dev-only bypass flag: `NEXT_PUBLIC_DEV_BYPASS_AUTH=true`.
- The frontend talks to the backend through App Router proxy routes and `credentials: "include"`.
- Redis is required for queue-backed features such as notifications and export jobs.
- Some export and Stellar workflows are still being hardened; see the open issues for the current backlog.

## Local Development

Follow these steps from a fresh clone to get the full stack running.

### Prerequisites

- Node.js 22.x and npm >= 9
- Docker (for Postgres and Redis)
- Rust + `cargo` (only needed if working on contracts; see `docs/SOROBAN_SETUP.md`)

### Contributor Quick Start

For most contributors, this is the fastest path:

```bash
npm install
npm run setup:check
npm run env:bootstrap
npm run dev:services
npm run dev:check
npm run dev
```

`npm run dev:services` first runs a Docker availability preflight, then starts the Postgres and Redis services from `compose.yaml`. `npm run dev:check` is intentionally part of the default startup path. It verifies that local environment files exist and that Postgres and Redis are reachable before NestJS starts. If infrastructure is down, it fails quickly with the exact command to run instead of printing long TypeORM connection retries.

On Windows, Docker Desktop must be open and using Linux containers. If Docker prints an error similar to `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`, start Docker Desktop, wait for the engine to finish booting, then rerun:

```bash
npm run dev:services
npm run dev:check
```

If PowerShell blocks `npm.ps1` with an execution-policy error, use `npm.cmd` for local commands without changing machine-wide policy:

```powershell
npm.cmd --version
npm.cmd install
npm.cmd run env:bootstrap
```

### 1. Install dependencies

```bash
npm install
npm run setup:check
```

### 2. Start infrastructure

`compose.yaml` provides a Postgres 16 instance on **localhost:55432** and a Redis 7 instance on **localhost:6379**.

```bash
npm run dev:services
```

Verify both containers are healthy before continuing:

```bash
docker compose -f compose.yaml ps
```

`running` only means the container process exists. Wait for Postgres and Redis to show a healthy status before starting the backend. Immediately after `npm run dev:services`, it is normal for `npm run dev:check` to fail for a few seconds while Postgres finishes accepting TCP connections.

### 3. Configure environment files

> **Security reminder:** Never commit `.env` or `.env.local` files. Always commit only the `.env.example` template files (which contain no real secrets). Do not paste real secret values into issues, PR descriptions, or comments.
>
> **Local-only secret examples:** Use the placeholders below only for local development. Do not reuse these example values outside of a local dev environment, and do not treat them as secure production credentials.

**Backend** - copy the sample and fill in the values marked `change-me`:

```bash
npm run env:bootstrap
```

Required keys to set before first boot (everything else has safe defaults):

| Key | Purpose |
|-----|---------|
| `JWT_SECRET` | Signs auth tokens; use any long random string locally |
| `APP_SECRET` | App-level HMAC secret; use any long random string locally |
| `CONFESSION_ENCRYPTION_KEY` | 64-character hex string used to encrypt confession content |
| `ENCRYPTION_CURRENT_KEY_VERSION` | Active envelope-encryption key version, usually `v1` locally |
| `ENCRYPTION_MASTER_KEY_v1` | 64-character hex master key for envelope encryption |
| `STELLAR_SERVER_SECRET` | Stellar keypair secret for on-chain operations (testnet only) |
| `TYPEORM_LOGGING` | Set to `true` only when debugging SQL; default is quiet local startup |

Copy-paste-safe local-only placeholders:

```env
JWT_SECRET=local-dev-jwt-secret-change-me-32-chars-minimum
APP_SECRET=local-dev-app-secret-change-me-32-chars-minimum
CONFESSION_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000001
ENCRYPTION_CURRENT_KEY_VERSION=v1
ENCRYPTION_MASTER_KEY_v1=0000000000000000000000000000000000000000000000000000000000000002
```

These values are valid for local bootstrapping only. Never reuse them in shared development, staging, production, demos, screenshots, issues, or PR comments.

Mail (`MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD`) and Stellar contract IDs are pre-filled with testnet values in the example file and can be left as-is for local development. Leave `STELLAR_FEATURES_ENABLED=false` (default) to boot without enforcing every contract ID; set it to `true` only when you need full on-chain anchoring and tipping.

**Frontend** - copy the sample (no secrets required for basic local use):

```bash
cp xconfess-frontend/.env.example xconfess-frontend/.env.local
```

The example file points API URLs at `http://localhost:5000/api`, WebSockets at `ws://localhost:5000`, and the frontend at `http://localhost:3000`; it is ready to use without changes. The frontend URL resolver also accepts `http://localhost:5000` and appends `/api` automatically, which keeps older local `.env.local` files working. If you want to skip the auth flow during UI development, add:

```
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

### 4. (Optional) Seed demo data

Populate the database with demo confessions, users, reactions, comments, and reports for testing:

```bash
npm run seed
```

The seed script is idempotent — re-running it will not duplicate data. It creates:
- 5 users (1 admin, 4 regular; password: `password123`)
- 20 confessions across 5 categories
- 50 reactions, 20 comments, 3 reports, 1 pending notification

Stellar anchoring is stubbed when `STELLAR_FEATURES_ENABLED=false` (default).

### 5. Boot the full stack

> **Environment safety:** Never commit `.env` or `.env.local` files. Only commit the `.env.example` templates. When sharing logs or asking for help in issues and PRs, redact all secrets, tokens, and private keys before pasting.

```bash
npm run dev:check
npm run dev
```

This starts the backend and frontend concurrently. Once both are ready:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Health (live) | http://localhost:5000/api/health/live |
| Health (ready) | http://localhost:5000/api/health/ready |
| Postgres | localhost:55432 |
| Redis | localhost:6379 |

See [Health Endpoint Quick Reference](docs/HEALTH_ENDPOINT_QUICK_REFERENCE.md) for details on liveness vs readiness probes, Kubernetes config examples, and response formats.

> **Render cold start notice:** The production backend is hosted on Render's free tier, which spins down instances after inactivity. The **first request after a period of inactivity may take 50 seconds or more** to respond while the instance wakes up. This is expected behaviour — it is not a broken deploy. To confirm the service is up, poll the health endpoints until you receive a `200`:
>
> ```bash
> # Wait for the backend to wake up
> curl https://<your-render-host>/api/health/live   # process alive
> curl https://<your-render-host>/api/health/ready  # all dependencies ready
> ```
>
> See [docs/production-critical-path.md](docs/production-critical-path.md) for more detail on Render cold starts and how to validate a fresh deploy.

### Common Local Startup Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ERR Postgres localhost:55432` from `npm run dev:check` | Postgres container is not running or Docker Desktop is not ready | Run `npm run dev:services`, then `npm run dev:check` |
| `ERR Redis localhost:6379` from `npm run dev:check` | Redis container is not running or Docker Desktop is not ready | Run `npm run dev:services`, then `npm run dev:check` |
| `ERR Postgres` or `ERR Redis` immediately after compose startup | Container is still `starting` or not yet accepting connections | Run `docker compose -f compose.yaml ps`, wait for healthy services, then rerun `npm run dev:check` |
| `dockerDesktopLinuxEngine` pipe error on Windows | Docker Desktop is closed, still starting, or not using Linux containers | Open Docker Desktop, switch to Linux containers if needed, then rerun `npm run dev:services` |
| Backend config validation error | Required backend env vars are missing | Copy `xconfess-backend/.env.example` to `xconfess-backend/.env` |
| Frontend proxy requests return `503` | Backend is not running or `BACKEND_API_URL`/`NEXT_PUBLIC_API_URL` is wrong | Start the backend and confirm `http://localhost:5000/api/health/live` |
| Browser reports `_next/static` 404s, `text/plain` MIME errors, or `sw.js Failed to fetch` | A stale service worker is controlling the local dev tab | Close all `localhost:3000` tabs, reopen the app, and hard refresh once. Dev mode now unregisters xConfess service workers automatically |
| Very verbose SQL logs | `TYPEORM_LOGGING=true` | Set `TYPEORM_LOGGING=false` in `xconfess-backend/.env` |

### Running individual services

```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

## Scripts Reference

### Tests

```bash
# Backend unit tests
npm run backend:test

# Backend e2e tests (requires running stack)
npm run backend:test:e2e

# Frontend tests
npm run frontend:test

# Backend + Soroban contract tests (from monorepo root)
npm test
```

Root `npm test` runs backend unit tests, then contract tests via `npm run contract:test`. Use it when you want the same contract coverage as CI without running the full `npm run ci` pipeline.

For backend directories that are intentionally test-light, such as migrations, type definitions, and DTOs, see the [backend testing notes](xconfess-backend/README.md#intentionally-test-light-directories).

### Soroban contracts (Rust / `cargo`)

Rust commands for `xconfess-contracts` must be run with that directory as the working directory (or use the root `npm run contract:*` scripts, which delegate there automatically).

```bash
cd xconfess-contracts

# Format
cargo fmt --all

# Lint (clippy, warnings as errors â€” mirrors CI)
cargo clippy --workspace --all-targets --all-features -- -D warnings

# Tests
cargo test --workspace
```

Equivalent from the monorepo root (no `cd` required):

```bash
npm run contract:fmt
npm run contract:lint
npm run contract:test
```

See `xconfess-contracts/README.md` for release builds, integration tests, and deployment.

### Builds

```bash
npm run backend:build
npm run frontend:build
npm run contract:build
```

### Database Migrations

xConfess manages its Postgres schema through TypeORM migrations. Two directories
are loaded by the CLI and the app: `xconfess-backend/migrations/` and
`xconfess-backend/src/migrations/`.

```bash
# List all migrations and show which have run
npm run backend:migration:show

# Apply all pending migrations (clean or CI database)
npm run backend:migration:run

# Repair an existing local dev database without wiping data
# (adds any missing columns, indexes, and backfills search_vector)
npm run backend:schema:repair
```

**When to use each:**

| Situation | Command |
|-----------|---------|
| Fresh Postgres container or CI run | `npm run backend:migration:run` |
| Existing local dev database (may have been created via `synchronize`) | `npm run backend:schema:repair` |
| Debugging a migration list error | `npm run backend:migration:show` |

After running either migration command, verify the readiness probe returns 200:

```bash
curl http://localhost:5000/api/health/ready
```

If the schema is still out of sync, the response body includes `missingColumns`,
`missingIndexes`, and a `hint` with the exact command to run.

### Lint

```bash
npm run backend:lint
npm run frontend:lint
npm run contract:lint
```

### Full CI check (mirrors the CI pipeline)

```bash
npm run ci
```

This runs `ci:backend`, `ci:frontend`, and `ci:contract` in sequence â€” build, lint, and test for each package.

## Contributing

xConfess participates in Stellar Wave. Check the open issues for work tagged `Stellar Wave`, then coordinate before opening a PR.

Before opening a PR, read the [small PR policy](docs/SMALL_PR_POLICY.md). Keep each PR focused on one issue, include tests for code changes, and screenshots for UI changes.

When your PR is ready for review, include a concise summary, validation results, screenshots for UI changes, and any known limitations.

When reporting bugs, see [Attaching Logs to Issues and PRs](docs/LOG_ATTACHING_GUIDE.md) for redaction guidelines.

### Backend endpoint checklist

When adding a new API endpoint, follow the [API endpoint contributor checklist](docs/contributing-api-endpoints.md) to cover controller, DTO, auth, tests, Swagger, and frontend proxy updates.

## Documentation

- [Account Recovery Guide](docs/account-recovery.md) — What to do if you connect the wrong wallet or network
- [Contributor Guide](docs/CONTRIBUTOR_GUIDE.md) — Local setup, branch hygiene, PR expectations, and validation commands

## Package Docs
- `xconfess-backend/README.md`
- `xconfess-frontend/README.md`
- `xconfess-contracts/README.md`
- `docs/message-e2e-encryption.md` — E2E private messaging protocol
