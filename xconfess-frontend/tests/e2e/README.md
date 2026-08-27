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
npx playwright test tests/e2e/wave-demo-journey.spec.ts --project=desktop
```

Failure screenshots, video, and traces use the defaults in `playwright.config.ts`
and can be enabled with Playwright's usual `--trace on` flag when collecting
demo evidence.
