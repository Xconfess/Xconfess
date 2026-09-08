# GrantFox Follow-Up Issues

Date: 2026-09-05

These are genuine follow-up issues discovered during implementation and
validation. They are not placeholders for invented traction or campaign copy.

## 1. Restore Live Backend Liveness

- Status: Code-side smoke validation remediated with bounded Render wake
  retries; `npm run deploy:smoke` passed without mutation mode on 2026-09-07.
- Evidence: `npm run deploy:smoke` timed out after 15000ms for
  `https://xconfess-backend.onrender.com/api/health/live`. On 2026-09-07,
  direct liveness reached 200 after about 21.6s, while readiness/status returned
  empty 503 responses with `x-render-routing: hibernate-wake-error`.
- Impact: Reviewers cannot verify a fully live production product while the
  backend liveness endpoint is unavailable. The smoke runner now handles the
  observed hibernation wake path, but a paid or non-hibernating backend remains
  recommended before campaign launch.
- Acceptance: Keep `npm run deploy:smoke` passing without mutation mode and
  monitor Render wake failures. Move off hibernating infrastructure if wake
  errors recur during review.

## 2. Run Production-Like Migration Validation

- Status: Completed for fresh and supported Render production paths on
  2026-09-07.
- Evidence: a disposable local Postgres database
  `xconfess_fresh_migration_validation_4` applied all 51 TypeORM migrations
  from an empty schema via `npm run backend:migration:run`; a follow-up
  `npm run backend:migration:show` marked all 51 migrations as applied. A
  separate disposable database was schema-synchronized to reproduce the legacy
  Render state, then `npm run render:prestart` baselined 51 compiled migrations
  and ensured confession readiness indexes.
- Impact: Fresh databases can run migrations deterministically, and the current
  production path can safely recognize an existing synchronized schema before
  startup without attempting destructive duplicate DDL.
- Acceptance: Keep `npm run backend:build`, `npm run render:prestart`, and
  `npm run backend:migration:run`/`show` passing against disposable databases
  before deploys that touch schema.

## 3. Reduce Existing Frontend Lint Warnings

- Status: Completed on 2026-09-07.
- Evidence: `npm run frontend:lint` exited successfully with no warnings after
  cleanup merged into `main`.
- Impact: Frontend lint no longer carries known warning debt into GrantFox
  readiness checks.
- Acceptance: Keep `npm run frontend:lint` warning-free.

## 4. Review Dependency Vulnerabilities

- Status: Safe remediations completed; see
  `docs/dependency-security-audit.md`.
- Evidence: `npm audit` now reports 0 critical, 0 high, and 0 moderate
  findings. Two low findings remain from `csurf`'s bundled `cookie`
  dependency.
- Impact: Security review is documented for readiness. The remaining low
  finding should still be removed in a dedicated CSRF middleware replacement.
- Acceptance: Replace `csurf` with a maintained CSRF middleware and verify the
  backend CSRF regression suite, backend build, and deployed smoke flow.
