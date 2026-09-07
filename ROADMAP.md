# Xconfess roadmap

This roadmap is intentionally short and contributor-facing. It helps OSS contributors choose useful work without needing private planning context.

## Current focus

1. Production reliability
   - Keep Vercel and Render deploys green.
   - Move schema changes through safe TypeORM migrations.
   - Add smoke tests for auth, health, and frontend proxy routes.

2. Contributor experience
   - Keep issues small and well-labeled.
   - Document local setup, validation commands, and troubleshooting.
   - Prefer one issue per PR.

3. Auth and privacy hardening
   - Normalize registration, login, and session contracts.
   - Preserve HttpOnly cookie auth.
   - Improve user-facing error messages without leaking internals.

4. Stellar integration
   - Verify deployed testnet contract IDs.
   - Keep backend, frontend, and deployment metadata in sync.
   - Expand contract smoke checks and reconciliation tests.

5. Moderation, safety, and operations
   - Improve observability with request IDs and structured logs.
   - Add admin diagnostics for queues, schema, Stellar, and email.
   - Keep free-tier limitations explicit in docs and health checks.

## Contributor lanes

| Lane | Best for | Examples |
| --- | --- | --- |
| `docs` | First-time contributors | Setup fixes, screenshots, troubleshooting |
| `frontend` | React/Next.js contributors | UI states, route tests, mobile polish |
| `backend` | NestJS contributors | DTO validation, health checks, service tests |
| `stellar` | Stellar/Soroban contributors | Contract env verification, testnet smoke scripts |
| `ops` | CI/deployment contributors | GitHub Actions, Render/Vercel preflight checks |

## Maintainer rule of thumb

Before marking an issue ready for an OSS program, make sure it has:

- clear problem statement
- expected files or area
- acceptance criteria
- validation command
- labels for type, area, priority, and program
