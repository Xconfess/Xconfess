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

- Status: Safe remediations completed; see
  `docs/dependency-security-audit.md`.
- Evidence: `npm audit` now reports 0 critical, 0 high, and 0 moderate
  findings. Two low findings remain from `csurf`'s bundled `cookie`
  dependency.
- Impact: Security review is documented for readiness. The remaining low
  finding should still be removed in a dedicated CSRF middleware replacement.
- Acceptance: Replace `csurf` with a maintained CSRF middleware and verify the
  backend CSRF regression suite, backend build, and deployed smoke flow.
