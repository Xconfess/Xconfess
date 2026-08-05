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

- Node.js â‰¥ 18 and npm â‰¥ 9
- Docker (for Postgres and Redis)
- Rust + `cargo` (only needed if working on contracts â€” see `docs/SOROBAN_SETUP.md`)

### 1. Install dependencies

```bash
npm install
```

### 2. Start infrastructure

`compose.yaml` provides a Postgres 16 instance on **localhost:55432** and a Redis 7 instance on **localhost:6379**.

```bash
docker compose -f compose.yaml up -d
```

Verify both containers are healthy before continuing:

```bash
docker compose -f compose.yaml ps
```

### 3. Configure environment files

> **Security reminder:** Never commit `.env` or `.env.local` files. Always commit only the `.env.example` template files (which contain no real secrets). Do not paste real secret values into issues, PR descriptions, or comments.

**Backend** â€” copy the sample and fill in the values marked `change-me`:

```bash
cp xconfess-backend/.env.example xconfess-backend/.env
```

Required keys to set before first boot (everything else has safe defaults):

| Key | Purpose |
|-----|---------|
| `JWT_SECRET` | Signs auth tokens â€” use any long random string locally |
| `APP_SECRET` | App-level HMAC secret â€” use any long random string locally |
| `CONFESSION_ENCRYPTION_KEY` | 64-character hex string used to encrypt confession content |
| `STELLAR_SERVER_SECRET` | Stellar keypair secret for on-chain operations (testnet only) |

Mail (`MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD`) and Stellar contract IDs are pre-filled with testnet values in the example file and can be left as-is for local development. Leave `STELLAR_FEATURES_ENABLED=false` (default) to boot without enforcing every contract ID; set it to `true` only when you need full on-chain anchoring and tipping.

**Frontend** â€” copy the sample (no secrets required for basic local use):

```bash
cp xconfess-frontend/.env.example xconfess-frontend/.env.local
```

The example file points all URLs at `localhost:5000` (backend) and `localhost:3000` (frontend) and is ready to use without changes. If you want to skip the auth flow during UI development, add:

```
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```
| Key | Purpose |
|-----|---------|
| `JWT_SECRET` | Signs auth tokens — use any long random string locally |
| `APP_SECRET` | App-level HMAC secret — use any long random string locally |
| `CONFESSION_ENCRYPTION_KEY` | 64-character hex string used to encrypt confession content |
| `STELLAR_SERVER_SECRET` | Stellar keypair secret for on-chain operations (testnet only) |
| `TIP_VERIFICATION_STALE_THRESHOLD_MINUTES` | SLA threshold (minutes) for marking pending tips as stale |

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

> **Environment safety:** Never commit `.env` or `.env.local` files â€” only commit the `.env.example` templates. When sharing logs or asking for help in issues and PRs, redact all secrets, tokens, and private keys before pasting.

```bash
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

When your PR is ready for review, use the [Ready for Review comment template](docs/WAVE_5_READY_FOR_REVIEW_TEMPLATE.md) to signal maintainers.

When reporting bugs, see [Attaching Logs to Issues and PRs](docs/LOG_ATTACHING_GUIDE.md) for redaction guidelines.

## GrantFox Campaign

xConfess participates in the GrantFox Official Campaign. All related pull requests must include the labels `GrantFox OSS`, `Official Campaign`, and `Maybe Rewarded`. Ensure you link your PR to its corresponding issue using `Closes #ISSUE_NUMBER`. For more details, refer to the contributor guide gf-09 (link to be added once published).

## Documentation

- [Account Recovery Guide](docs/account-recovery.md) — What to do if you connect the wrong wallet or network

## Package Docs
- `xconfess-backend/README.md`
- `xconfess-frontend/README.md`
- `xconfess-contracts/README.md`
- `docs/message-e2e-encryption.md` — E2E private messaging protocol
