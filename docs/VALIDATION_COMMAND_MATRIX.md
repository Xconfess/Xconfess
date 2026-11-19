# Validation Command Matrix

This matrix maps each change area to the exact commands you must run locally before opening a pull request.
Copy-paste each command directly into your terminal from the repository root.

> **Tip:** When in doubt, run `npm run ci` — it covers backend, frontend, and contract checks in one shot.

---

## Quick Reference

| Change Area | Lint / Format | Tests | Build | Full CI shortcut |
|---|---|---|---|---|
| [Docs](#docs) | _(none required)_ | _(none required)_ | _(none required)_ | _(none required)_ |
| [Frontend — Component](#frontend--component) | `npm run frontend:lint` | `npm run frontend:test` | `npm run frontend:build` | `npm run ci:frontend` |
| [Frontend — Route / Page](#frontend--route--page) | `npm run frontend:lint` | `npm run frontend:test` | `npm run frontend:build` | `npm run ci:frontend` |
| [Backend — Service / Controller](#backend--service--controller) | `npm run backend:lint` | `npm run backend:test` | `npm run backend:build` | `npm run ci:backend` |
| [Database Migration](#database-migration) | `npm run backend:lint` | `npm run backend:test` | `npm run backend:migration:run` | `npm run ci:backend` |
| [Stellar / Soroban Contract](#stellar--soroban-contract) | `npm run contract:lint` | `npm run contract:test` | `npm run contract:build` | `npm run ci:contract` |
| [Ops / Scripts](#ops--scripts) | _(none required)_ | _(manual smoke)_ | _(none required)_ | `npm run deploy:preflight` |
| [Critical contract change](#critical-contract-change) | _(none required)_ | `npm run contract:review-delay:test` | _(none required)_ | `npm run contract:review-delay:test` |
| [API contract change](#api-contract-change) | _(none required)_ | `npm run api:contract:test` | _(none required)_ | `npm run api:contract:check` |
| [Fixtures / test data](#fixtures--test-data) | _(none required)_ | `npm run fixtures:test` | _(none required)_ | `npm run fixtures:validate` |
| [Release artifacts / Docker](#release-artifacts--docker) | _(none required)_ | `npm run artifacts:test` | _(none required)_ | `npm run artifacts:scan` |

---

## Docs

Changes to `.md` files, diagrams, screenshots, or any file under `docs/`.

```bash
# No automated commands required.
# Verify rendering by previewing the markdown in your editor or GitHub preview.
```

**Acceptance gate:** Markdown renders correctly with no broken links or malformed tables.

---

## Frontend — Component

Changes to reusable UI components (files under `xconfess-frontend/src/components/`).

```bash
# 1. Lint
npm run frontend:lint

# 2. Type-check
npm run frontend:typecheck

# 3. Unit tests
npm run frontend:test

# 4. Build (catches type errors missed by the dev server)
npm run frontend:build

# — or run all four with one command —
npm run ci:frontend
```

**Acceptance gate:** All four steps exit with code `0`.

---

## Frontend — Route / Page

Changes to page-level components or routing (files under `xconfess-frontend/src/pages/` or route config).

```bash
# 1. Lint
npm run frontend:lint

# 2. Type-check
npm run frontend:typecheck

# 3. Unit tests
npm run frontend:test

# 4. Build
npm run frontend:build

# — or run all four with one command —
npm run ci:frontend

# Optional — smoke tests for proxy routes
npm run frontend:test:smoke
```

**Acceptance gate:** `npm run ci:frontend` exits with code `0`. Smoke tests are optional but recommended for route changes.

---

## Backend — Service / Controller

Changes to NestJS services, controllers, guards, DTOs, or interceptors (files under `xconfess-backend/src/`).

```bash
# 1. Lint
npm run backend:lint

# 2. Unit tests
npm run backend:test

# 3. Build
npm run backend:build

# — or run all three with one command —
npm run ci:backend

# Optional — end-to-end tests (recommended for new endpoints)
npm run backend:test:e2e
```

**Acceptance gate:** `npm run ci:backend` exits with code `0`.

---

## Database Migration

New TypeORM migration files or changes to existing migrations (files under `xconfess-backend/src/migrations/`).

```bash
# 1. Lint
npm run backend:lint

# 2. Unit tests (entities + migration logic)
npm run backend:test

# 3. Build (ensures the migration compiles)
npm run backend:build

# 4. Apply migration against local database
#    Requires Docker services to be running: npm run dev:services
npm run backend:migration:run

# Verify current migration state
npm run backend:migration:show

# — full backend CI check —
npm run ci:backend
```

> **Warning:** Always run `npm run dev:services` (`docker compose up -d`) before applying migrations locally so PostgreSQL is available.

**Acceptance gate:** `npm run ci:backend` exits `0` and `npm run backend:migration:run` completes without errors.

---

## Stellar / Soroban Contract

Changes to Rust smart contracts under `xconfess-contracts/`.

```bash
# 1. Format check (must pass — rustfmt enforced in CI)
npm run contract:fmt:check

# Auto-fix formatting issues locally
npm run contract:fmt

# 2. Clippy lint
npm run contract:lint

# 3. Unit tests
npm run contract:test

# 4. Release build (WASM output)
npm run contract:build:release

# — or run all four CI steps with one command —
npm run ci:contract

# Optional — integration tests against Soroban sandbox
npm run contract:test:integration

# Optional — deploy to testnet and verify
npm run contract:deploy:testnet
```

**Acceptance gate:** `npm run ci:contract` exits with code `0`. Rustfmt and Clippy must both pass — the CI gate is strict.

---

## Ops / Scripts

Changes to deployment scripts, CI config, Docker files, `render.yaml`, or files under `scripts/`.

```bash
# 1. Run deployment preflight checks
npm run deploy:preflight

# 2. Verify contract environment variables are set
npm run contracts:verify-env

# 3. If secrets-scanning config changed, run the self-test
npm run secret-scan:self-test

# 4. If the change affects a deployed environment, run smoke tests
npm run deploy:smoke
```

**Acceptance gate:** `npm run deploy:preflight` exits with code `0` and no secrets are flagged.

---

## Critical contract change

Changes to deployment scripts, signer rotation, migrations, or governance actions that can
affect a live contract. See
[contract-review-delay-policy.md](contract-review-delay-policy.md).

```bash
npm run contract:review-delay:test
npm run contract:review-delay -- list-actions
npm run contract:review-delay -- schedule --action contract.deploy.mainnet \
  --actor "$(git config user.name)" --reference <PR-or-ticket>
npm run contract:review-delay -- status --action contract.deploy.mainnet
```

**Acceptance gate:** unit and integration tests pass; the target action has an elapsed window
before any critical deploy. `--force` never bypasses the gate.

---

## API contract change

New endpoints, DTO changes, or modified request/response shapes. See
[api-contract-review-workflow.md](api-contract-review-workflow.md).

```bash
npm run api:contract:test
# With the backend running:
curl --fail --silent http://127.0.0.1:5000/api/docs-json > openapi.json
npm run api:contract-drift -- --spec="$PWD/openapi.json"
npm run api:contract:check -- --spec="$PWD/openapi.json"
```

**Acceptance gate:** no breaking changes, or an intentional baseline update committed in the
same PR via `npm run api:contract:update -- --spec=openapi.json`.

---

## Fixtures / test data

New or modified test data for backend, frontend, or contracts. See
[fixture-authoring-guide.md](fixture-authoring-guide.md).

```bash
npm run fixtures:validate
npm run fixtures:validate:self-test
npm run fixtures:test
```

**Acceptance gate:** all identities use allowed synthetic prefixes/domains and no real
credential or personal data appears in the diff.

---

## Release artifacts / Docker

Changes to Dockerfiles, `compose.yaml`, `render.yaml`, build config, archives, or release
scripts. See [release-artifact-secret-scanning.md](release-artifact-secret-scanning.md).

```bash
npm run artifacts:scan:self-test
npm run artifacts:scan
npm run artifacts:test
```

**Acceptance gate:** zero high-confidence findings. Any finding must be removed from its
source, the artifact rebuilt, and a real credential rotated before merge.

---

## Running Everything at Once

To replicate exactly what CI runs before merging any PR:

```bash
npm run ci
```

This is equivalent to:

```bash
npm run ci:backend && npm run ci:frontend && npm run ci:contract
```

Use this command as a final check before pushing your branch.

---

## See Also

- [CONTRIBUTING.md](../CONTRIBUTING.md) — full contributor guide
- [CI_CHECKS_SUMMARY.md](../CI_CHECKS_SUMMARY.md) — CI pipeline overview
- [docs/SMALL_PR_POLICY.md](SMALL_PR_POLICY.md) — PR size guidelines
