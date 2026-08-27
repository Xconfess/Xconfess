# XConfess Wave 5 Roadmap

Last updated: May 26, 2026

## Status Snapshot

- Program status: XConfess has been approved since Wave 1.
- Participation history: Waves 1 through 4 are complete.
- Current phase: Wave 5 active development.
- Product scope: anonymous confession platform with a NestJS backend, Next.js frontend, PostgreSQL, Redis-backed queues, WebSockets, and Soroban smart contracts on Stellar.

## Current Technical Baseline

- Backend: Jest test suite has been brought back to a passing local baseline.
- Frontend: `npm run build --workspace=xconfess-frontend` passes.
- Frontend local env: `xconfess-frontend/.env.local` is expected locally, with `BACKEND_API_URL=http://localhost:5000`.
- Frontend dev URL: `http://localhost:3000`.
- Backend dev URL: `http://localhost:5000`.
- Contracts: `cargo fmt`, `cargo clippy`, and `cargo test --workspace` pass from `xconfess-contracts`.
- Local services: PostgreSQL and Redis are provided by `compose.yaml`.
- Local database port: Docker Postgres is exposed on `localhost:55432` to avoid conflicts with a locally installed PostgreSQL service on `5432`.

## Wave 5 Objective

Wave 5 should move XConfess from a completed Wave 1-4 implementation into a stronger production-readiness and demo-readiness phase. The focus is not just adding features; it is making the existing anonymous confession, Stellar anchoring, tipping, moderation, notification, and admin flows feel reliable, explainable, and easy to demonstrate.

## Development Tracks

### 1. Repo Baseline And CI Confidence

- Checkpoint the current clean-up work before starting broad Wave 5 changes.
- Keep root `npm run test`, frontend build, backend tests, and contract checks green.
- Record any local setup requirements that are not obvious from the root README.
- Reduce noisy warnings and test fragility that could distract from Wave 5 delivery.

### 2. Full-Stack Local Demo

- Start PostgreSQL and Redis with `compose.yaml`.
- Start the backend on `http://localhost:5000`.
- Start the frontend on `http://localhost:3000`.
- Seed or document demo data for confessions, reactions, comments, tips, reports, and notifications.
- Smoke test one complete user journey end to end.

### 3. Product Experience

- Polish the confession composer, feed, detail page, search, reactions, comments, and messaging flows.
- Tighten empty, loading, error, offline, and permission states.
- Verify responsive behavior on dashboard and user-facing pages.
- Make the app feel coherent enough for a live Wave 5 demo without needing console workarounds.

### 4. Stellar And Soroban UX

- Validate wallet connection states across the frontend.
- Verify confession anchoring and tipping flows against the backend API contract.
- Show clear pending, confirmed, failed, and retry states for on-chain actions.
- Add or verify explorer links, transaction references, and contract ID visibility where useful.
- Keep Soroban contract tests and compatibility fixtures aligned with frontend and backend behavior.

### 5. Admin And Operator Readiness

- Exercise moderation, reports, analytics, notification jobs, and data export flows.
- Verify failed notification job replay and queue health views.
- Confirm audit logs capture sensitive admin actions.
- Review release, rollback, and incident runbooks for anything Wave 5 changes.

### 6. Wave 5 Reporting Package

- Prepare a short Wave 5 progress summary using `maintainer/WAVE_5_PROGRESS_TEMPLATE.md`.
- Capture screenshots or a demo script for the main flows — see `docs/DEMO_SCRIPT.md`.
- List completed Wave 5 work, remaining risks, and next milestones.
- Link key verification commands and results.
- Keep the external contributor issue queue aligned with `maintainer/WAVE_TRIAGE.md`.
- Use `maintainer/WAVE_5_CONTRIBUTOR_ASSIGNMENT.md` for contributor assignment process.
- Use `maintainer/DASHBOARD_SYNC_CHECKLIST.md` to keep GitHub issue status aligned with the Drips Wave dashboard.

## Immediate Next Actions

- [x] Create or switch to a Wave 5 branch when ready.
- [x] Demo script prepared at `docs/DEMO_SCRIPT.md`.
- [ ] Commit the current baseline fixes once reviewed.
- [ ] Start local PostgreSQL and Redis.
- [ ] Confirm the backend `.env` uses `DB_PORT=55432` for the Docker Postgres service.
- [ ] Start the backend on port `5000`.
- [ ] Start the frontend on port `3000`.
- [ ] Run a full-stack smoke test through the browser.
- [ ] Add or update demo seed data.
- [ ] Choose the first Wave 5 feature or hardening task to implement.
- [ ] Prepare the first Wave 5 progress update.

## Definition Of Done For Wave 5

- The full local app boots through a documented command path.
- Frontend build passes.
- Backend tests pass.
- Contract formatting, linting, and tests pass.
- A complete confession-to-engagement user journey works end to end.
- A Stellar anchoring or tipping journey can be demonstrated clearly.
- Admin or operator workflows are verified for moderation, jobs, reports, or analytics.
- Wave 5 status materials are ready for review or submission.

## Current Risks And Notes

- The worktree already contains many useful baseline fixes; checkpoint them before starting large new changes.
- The frontend depends on `BACKEND_API_URL` for server-side API calls.
- API-backed browser flows need the backend running at `http://localhost:5000`.
- `xconfess-frontend/.env.local` should remain local-only and uncommitted.
- `xconfess-frontend/.env.example` should stay committed as the template for required frontend variables.
- Root Rust commands will not work because the Rust workspace lives in `xconfess-contracts`.
