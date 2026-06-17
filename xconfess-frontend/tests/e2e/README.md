# Frontend E2E (Playwright)

## Public pages smoke

Lightweight checks for demo-critical routes as an unauthenticated visitor (protected routes expect a redirect to `/login`).

### Prerequisites

From the **repository root**:

```bash
npm ci
cd xconfess-frontend && npx playwright install chromium
```

No running backend is required; tests mock `/api/auth/session` and confession list responses.

### Run locally

From the **repository root**:

```bash
npm run test:smoke --workspace=xconfess-frontend
```

Or from `xconfess-frontend/`:

```bash
npx playwright install chromium
npm run test:smoke
```

Playwright starts the Next.js dev server on port 3000 (see `playwright.config.ts`).

### What is covered

| Route | Unauthenticated expectation |
|---|---|
| `/` | Home / feed landing visible |
| `/login` | Sign-in form visible |
| `/register` | Registration form visible |
| `/search` | Dashboard search UI hidden (no session) |
| `/confessions/:id` | Demo confession content when backend is unavailable (dev default) |

### CI

Run the same command in your pipeline after `npm ci`. Full browser matrix tests live in other `tests/e2e` specs; smoke uses the `smoke` project (desktop Chromium only).

## Wave 5 seeded demo journey

`wave-demo-journey.spec.ts` exercises the demo path with mocked browser data:
feed, confession detail, report submission, and admin analytics. It assumes an
admin session returned by the mocked `/api/auth/session` route and does not
require a running backend.

Run it from `xconfess-frontend/`:

```bash
npm run test:wave-demo
```

For the release-gate smoke check, the Playwright dev server defaults to port
`3100` so it does not accidentally reuse another local app on `3000`. Override
the server target only when needed:

```bash
PLAYWRIGHT_PORT=3200 npm run test:wave-demo
PLAYWRIGHT_BASE_URL=https://staging.example.com npm run test:wave-demo
PLAYWRIGHT_REUSE_SERVER=true npm run test:wave-demo
```

To verify stability before a release, run the journey three times:

```bash
for i in 1 2 3; do npm run test:wave-demo || exit 1; done
```

Failure screenshots, video, and traces use the defaults in `playwright.config.ts`
and can be enabled with Playwright's usual `--trace on` flag when collecting
demo evidence.

### Release-gate CI hook

`.github/workflows/release-gate.yml` includes an optional `Wave Demo Journey`
job. It skips with a GitHub Actions notice unless both are configured:

- Repository variable `WAVE_DEMO_E2E_ENABLED=true`
- Repository secret `WAVE_DEMO_BACKEND_URL`

When enabled, assertion failures fail the job. When `WAVE_DEMO_REQUIRE_BACKEND`
is set, the spec also skips early if neither `BACKEND_API_URL` nor
`NEXT_PUBLIC_API_URL` is available.
