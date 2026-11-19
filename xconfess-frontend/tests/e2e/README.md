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

## Accessibility and keyboard smoke

The axe-core suite scans the public home page, login page, and authenticated
admin dashboard. The keyboard regression suite checks tab order and visible
keyboard focus in registration, confession composition, messaging, and the
messaging key-recovery dialog. Local API fixtures use fake identities and do
not require live services or credentials. Encrypted message previews and
generic key initialization errors are checked without exposing fixture content.

From the repository root:

```bash
npm ci
npx playwright install chromium
npm run frontend:test:a11y
```

Or from `xconfess-frontend/` after installing the browser:

```bash
npm run test:a11y
```

Playwright starts the frontend on port 3000. On failure, the assertion lists the
axe rule, impact, and affected selectors; use those selectors to locate the
markup and reproduce the issue in a browser. The run also retains Playwright's
failure trace as configured in `playwright.config.ts`.

The gender field is one radio group: it has one Tab stop, and arrow keys move
between its options according to native radio behavior. Tests intentionally do
not expect a separate Tab stop for every option. There are no other accepted
keyboard-navigation or critical/serious axe exceptions. Do not suppress a
violation broadly: if a temporary exception is approved, record its route,
rule, affected selector, rationale, owner, tracking issue, and remediation date
in the root `A11Y_CHECKLIST.md`. Keep exclusions limited to that documented
scope and remove them when the fix ships.

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
