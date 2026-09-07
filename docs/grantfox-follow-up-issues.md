# GrantFox Follow-Up Issues

Date: 2026-09-05

These are genuine follow-up issues discovered during implementation and
validation. They are not placeholders for invented traction or campaign copy.

## 1. Restore Live Backend Liveness

- Evidence: `npm run deploy:smoke` timed out after 15000ms for
  `https://xconfess-backend.onrender.com/api/health/live`.
- Impact: Reviewers cannot verify a fully live production product while the
  backend liveness endpoint is unavailable.
- Acceptance: `npm run deploy:smoke` passes without mutation mode enabled.

## 2. Run Production-Like Migration Validation

- Evidence: local `npm run backend:migration:show` could not load
  `data-source.ts` without configured database environment variables.
- Impact: Analytics and Soroban checkpoint tables must be applied safely before
  production traffic depends on them.
- Acceptance: `npm run backend:migration:show` and migration execution pass in
  staging or another production-like database.

## 3. Reduce Existing Frontend Lint Warnings

- Evidence: `npm run frontend:lint` now exits successfully, but reports
  warnings for unused symbols, hook dependencies, and `<img>` usage.
- Impact: Warnings do not block readiness locally, but reducing them improves
  reviewer confidence and long-term maintainability.
- Acceptance: `npm run frontend:lint` exits with no warnings.

## 4. Review Dependency Vulnerabilities

- Evidence: `npm install` reported npm audit findings earlier in this worktree.
- Impact: Security review should be complete before campaign launch.
- Acceptance: `npm audit` findings are triaged, fixed, or explicitly accepted
  with documented rationale.
