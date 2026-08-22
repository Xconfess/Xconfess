# Contributor Issue Backlog

These issues are ready to create in GitHub once repository authentication is restored. Each one is scoped for a focused contributor pull request with clear acceptance criteria.

## 1. Replace deprecated Edge runtime usage in frontend proxy routes

Labels: `frontend`, `nextjs`, `good first issue`

Next.js 16 warns that the Edge Runtime is deprecated during production builds. Audit frontend route handlers, proxy files, and middleware-style code that explicitly opts into edge runtime and move eligible handlers to the Node.js runtime.

Acceptance criteria:
- `npm run frontend:build` completes without the Edge Runtime deprecation warning.
- Auth/session and API proxy behavior remains covered by existing tests.
- Any route that must remain edge-based is documented with a short code comment explaining why.

## 2. Add deployment smoke checks for frontend auth and dashboard routes

Labels: `frontend`, `testing`, `deployment`

Add a small Playwright smoke suite that verifies deployed frontend routes load after a production build: home, login, register, dashboard redirect behavior, and admin redirect behavior.

Acceptance criteria:
- The smoke test can run against `BASE_URL`.
- Tests verify page shell rendering and no missing Next static assets.
- The suite is wired into CI or documented as a release-gate command.

## 3. Improve backend test log hygiene

Labels: `backend`, `testing`, `developer-experience`

The backend Jest suite passes, but expected error-path tests emit a large amount of Nest error output. Reduce noisy logs in tests without hiding real failures.

Acceptance criteria:
- `npx jest --config jest.config.js --runInBand --silent` remains green.
- Test logs no longer obscure pass/fail summaries in normal runs.
- Error-path assertions still verify that important log calls occur.

## 4. Resolve backend Jest open-handle warning

Labels: `backend`, `testing`, `quality`

The backend test run completes successfully but Jest reports that it did not exit cleanly. Identify the open handle and close it in the relevant test setup or teardown.

Acceptance criteria:
- Backend Jest exits without the open-handle warning.
- No production code is weakened just to satisfy tests.
- Add a short note in the relevant test helper if teardown behavior is non-obvious.

## 5. Add production environment validation examples

Labels: `docs`, `deployment`, `good first issue`

The backend now validates required environment variables strictly. Improve deployment docs with copy-ready examples for staging and production without exposing real secrets.

Acceptance criteria:
- Document required backend variables including database, JWT, encryption, CORS, Redis, and public API URLs.
- Include exact health check endpoints: `/api/health/live` and `/api/health/ready`.
- Include guidance that frontend API URLs should include `/api`.

## 6. Add admin responsive visual regression coverage

Labels: `frontend`, `admin`, `testing`

The admin layout has mobile drawer and desktop sidebar states. Add coverage that protects both layouts from regressions.

Acceptance criteria:
- Playwright screenshots or DOM assertions cover mobile and desktop admin navigation.
- Tests verify the drawer opens, closes, traps focus, and restores focus.
- Existing admin auth tests remain green.

## 7. Tighten service worker handling for Next static assets

Labels: `frontend`, `pwa`, `bug`

A stale service worker can intercept `_next/static` requests and produce MIME/404 errors during local development. Improve the service worker strategy so Next build assets are fetched network-first and failures do not poison the cache.

Acceptance criteria:
- `_next/static/*` requests bypass stale cached text/plain responses.
- Local dev no longer logs repeated `FetchEvent` network errors for Next chunks.
- Add a regression test or documented manual verification steps.

## 8. Create contributor-friendly seed data scenarios

Labels: `backend`, `developer-experience`, `database`

Improve seed data so contributors can quickly test normal user, admin, feed, moderation, and notification workflows locally.

Acceptance criteria:
- `npm run seed` works from the repo root with path aliases resolved.
- Seed output lists created accounts and local login credentials.
- Data includes at least one admin, one normal user, several confessions, reactions, comments, and reports.

## 9. Add deployment rollback runbook

Labels: `docs`, `deployment`, `operations`

Create a short rollback runbook for the current SSH/PM2 deployment workflow.

Acceptance criteria:
- Documents how to identify the last successful GitHub Actions deployment.
- Explains backend-first rollback and frontend-second rollback.
- Includes health check commands for backend readiness and frontend route smoke checks.

## 10. Polish empty and error states across secondary screens

Labels: `frontend`, `design`, `good first issue`

Audit secondary screens such as messages, search, analytics, settings, and notifications for inconsistent empty/error copy and styling.

Acceptance criteria:
- Empty and error states use concise professional copy.
- States use the shared brand surfaces and button styles.
- Screens remain accessible with meaningful headings and labelled actions.
