# xConfess Frontend

Next.js 16 App Router frontend for xConfess.

## Current Architecture

- Uses cookie-backed session auth and shared auth context
- App Router proxy routes in `app/api/*` talk to the NestJS backend
- `AuthProvider` and `AuthGuard` control runtime route protection
- Development-only auth bypass is available with `NEXT_PUBLIC_DEV_BYPASS_AUTH=true`
- NextAuth is not used in this codebase

## What the Frontend Covers

- confession feed and composer
- reactions, comments, and search
- messages, notifications, and profile settings
- end-to-end encrypted private messaging (see `docs/message-e2e-encryption.md`)
- admin moderation, reports, analytics, and user management
- Stellar anchoring and tipping surfaces

## Local Development

From the repo root:

```bash
npm run dev
```

Frontend only:

```bash
npm run dev --workspace=xconfess-frontend
```

Build:

```bash
npm run build --workspace=xconfess-frontend
```

Typecheck (runs `tsc --noEmit`, no build output produced):

```bash
npm run frontend:typecheck
```

This is also run as its own CI step, separate from the build, so a type
regression fails clearly and doesn't get bundled into a build-failure log.

### Generated API types

`npm run generate-api --workspace=xconfess-frontend` fetches the backend's
OpenAPI spec (from `OPENAPI_SPEC_URL`, default `http://localhost:4000/api`,
so the backend must be running) and writes typed client code to
`app/lib/api/generated/`. That output is gitignored and not committed;
nothing in the app currently imports from it. If you do generate it locally,
`npm run frontend:typecheck` will pick up and typecheck those generated
files automatically, since it type-checks the whole project rather than a
fixed file list.

## Environment

Copy `.env.example` to `.env.local` and fill in the values before starting the dev server.

```bash
cp .env.example .env.local
```

### Required

| Variable | Description |
|---|---|
| `BACKEND_API_URL` | **Canonical** server-side URL for the NestJS API, including `/api` (for example `http://localhost:5000/api`). Used by all App Router proxy routes. Never exposed to the browser. |
| `NEXT_PUBLIC_API_URL` | Same backend API URL, including `/api`, baked into the browser bundle for client-side calls. |
| `NEXT_PUBLIC_WS_URL` | WebSocket endpoint for real-time reactions and notifications. |

### Optional

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | — | Public URL of this frontend (share links, OG meta). |
| `NEXT_PUBLIC_DEV_BYPASS_AUTH` | `false` | Skip auth checks locally. Must be `false` in staging/production. |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` | `testnet` or `mainnet`. |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | — | Horizon REST endpoint. |
| `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL` | — | Soroban RPC endpoint. |
| `NEXT_PUBLIC_STELLAR_CONTRACT_ID` | — | Deployed confession-anchor contract ID. |
| `STRICT_ENV_VALIDATION` | `false` | Set to `true` to fail server startup when required environment variables are missing. |
| `NEXT_PUBLIC_DEBUG_NOTIFICATIONS` | `false` | Verbose notification logs in the browser. |
| `NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN` | `false` | Show mock admin login button (dev only). |
| `NEXT_PUBLIC_ERROR_TRACKING_URL` | — | Error tracking ingest URL (e.g. Sentry). |

> **Note:** `BACKEND_URL` is not a valid variable in this project. All proxy routes use `BACKEND_API_URL` via `getApiBaseUrl()` in `app/lib/config.ts`. The resolver accepts either `http://localhost:5000` or `http://localhost:5000/api`, but `.env.example` uses the explicit `/api` form so route construction is obvious. The startup validator (`instrumentation.ts`) warns if `BACKEND_API_URL` is missing, or throws at boot when `STRICT_ENV_VALIDATION=true`.

## Error Handling & Resilience

The application implements a centralized error handling system to ensure UI stability and consistent developer feedback.

### 1. API Error Normalization
All `app/api/*` proxy routes use `createApiErrorResponse` from `@/lib/apiErrorHandler`.
- **Consistent Shape**: Returns `{ message, status, correlationId }`.
- **Structured Logging**: Automatic server-side logging with context and trace IDs.

### 2. Stellar Error Handling
Stellar-specific errors (wallet, network, contract) are handled by `handleStellarError` in `@/lib/stellarErrorHandler`.
- **User-Safe Messages**: Technical XDR errors are mapped to actionable user feedback.
- **Toast Integration**: Automatically triggers status notifications for transaction lifecycle events.

### 3. Offline Resilience
- **Inbox Handling**: The messages inbox detects backend connectivity issues and displays an offline state with manual retry triggers.
- **Skeleton Loaders**: Used across all data-fetching components to prevent layout shift during loading or failure states.

## Notes

- The frontend expects the backend to be running for real data.
- Some routes have offline-friendly UI states, but they still depend on backend responses.
- Do not reintroduce browser-local mock admin branches; use the dev bypass flag only in development.
