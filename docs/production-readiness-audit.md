# Xconfess Production Readiness Audit

Date: 2026-09-05

This audit treats the GrantFox implementation brief as product requirements and the repository as the source of truth. It does not include live traffic claims or fabricated usage data.

## Summary

| Area | Status | Evidence | Gap or risk |
| --- | --- | --- | --- |
| Frontend framework | READY | `xconfess-frontend` uses Next.js 16, React 19, Jest, Playwright, Tailwind. | Public traction UI is missing until Milestone 2. |
| Backend framework | READY | `xconfess-backend` uses NestJS 11 with modular services/controllers. | Some older comments/encoding artifacts should not be treated as behavior. |
| Database/ORM | READY | TypeORM with Postgres entities and deterministic migrations under `xconfess-backend/src/migrations`. | New analytics event tables require a production migration. |
| Redis/cache | PARTIAL | Redis/BullMQ configuration exists; cache namespace helpers cover analytics cache keys. | Redis can be disabled locally; readiness must distinguish disabled from failed. |
| Queues/workers | PARTIAL | BullMQ global config, notifications/export/draft queue infrastructure, queue health indicator. | Public smoke/readiness orchestration remains incomplete. |
| WebSockets | READY | Socket.IO adapter, reaction gateway, notification/admin gateway tests. | Security regression suite should keep channel authorization covered. |
| Authentication/session | READY | JWT auth, lockout service, password reset token service, 2FA support, CSRF exemptions for auth/register. | Login analytics must not store email or tokens. |
| Anonymous identity ownership | READY | `AnonymousUser`, `user_anonymous_users`, ownership guard/helper, IDOR tests. | Public metrics must use pseudonymous IDs only, never raw IPs. |
| Telemetry/logging | PARTIAL | Request ID middleware and structured HTTP logging interceptor with redaction. | Logs currently include `req.ip`; analytics must not copy raw IPs. External error monitoring is not evident. |
| Stellar SDK usage | READY | `@stellar/stellar-sdk`, `StellarService`, config validation, anchoring, tipping verification, reconciliation guards. | Production reconciliation still depends on configured Horizon/database availability. |
| Soroban contracts | READY | Rust contract workspace, anonymous tipping tests, deployment docs, testnet JSON, event parser fixtures, persisted event checkpoints. | A production worker still needs live RPC credentials and scheduling configuration. |
| Contract addresses/networks | READY | `.env.example`, `deployments/testnet.json`, deployment metadata service, `StellarConfigService` network/ID mismatch tests. | Mainnet metadata must be generated before mainnet launch. |
| Migrations | READY | TypeORM migration scripts and migration commands exist. | New analytics migration must be backwards compatible and non-destructive. |
| Test suites | READY | Backend Jest, frontend Jest/Playwright, contract tests. | Milestone 1 needs privacy/idempotency and public traction tests. |
| CI workflows | PARTIAL | Root package scripts define CI-like backend/frontend/contract gates. | Actual GitHub workflow coverage was not validated in this local audit. |
| Vercel/frontend deploy | PARTIAL | Next frontend and `Dockerfile.frontend` exist; live URL documented. | Public `/traction` page is not implemented yet. |
| Backend hosting/env | PARTIAL | `render.yaml`, backend Dockerfile, deployment docs and env validation exist. | Production backend URL and migration state are environment-dependent. |
| CORS | READY | Backend uses `FRONTEND_URL` as the single allowed origin for HTTP and WebSocket configuration. | Multi-origin production setups would need explicit support. |
| Health endpoints | READY | `GET /api/health/live`, `GET /api/health/ready`, `GET /api/health/status`, local readiness command. | Live deployed smoke currently times out against backend liveness. |
| Error monitoring | PARTIAL | Global exception filters and structured logs exist. | No first-class external error monitoring integration found. |
| Rate limiting | READY | Global Nest throttler plus stricter endpoint-level throttles in health and other modules. | Public traction endpoint should have explicit read throttle. |
| Secrets handling | READY | Env validation enforces strong key shapes; `.env.example` uses placeholders. | Never commit real secret values; Stellar server secret remains sensitive. |

## Existing Reuse Targets

- `AnalyticsModule`, `AnalyticsService`, `AnalyticsCacheKeys`, and `CacheService` for cacheable metrics.
- TypeORM repositories and migrations for analytics persistence.
- Existing domain records for aggregate counts: users, confessions, comments, reactions, messages, tips, Stellar anchors.
- `RequestIdMiddleware` and structured logging for correlation IDs.
- `TippingService` idempotency, retry metadata, and `tip.verified`/`tip.verification_failed` events.
- Stellar configuration through `STELLAR_NETWORK`, Horizon/RPC URLs, and contract ID env vars.

## Critical Blockers For GrantFox Readiness

- No public aggregate traction endpoint exists.
- No persisted privacy-safe analytics event pipeline exists.
- Public reviewer evidence page `/traction` is missing.
- Stellar/Soroban activity is implemented in pieces but not summarized publicly.
- Production smoke and readiness commands are unified locally, but live backend liveness must be reachable before campaign use.

## Environment Variables

Required or relevant variables observed:

- Core: `NODE_ENV`, `APP_ENV`, `PORT`, `FRONTEND_URL`, `BACKEND_URL`
- Database: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_READ_HOST`, `DB_READ_PORT`
- Redis/jobs: `REDIS_HOST`, `REDIS_PORT`, `ENABLE_BACKGROUND_JOBS`
- Auth/secrets: `JWT_SECRET`, `APP_SECRET`
- Encryption: `CONFESSION_ENCRYPTION_KEY`, `ENCRYPTION_CURRENT_KEY_VERSION`, `ENCRYPTION_MASTER_KEY_v1`
- Stellar: `STELLAR_FEATURES_ENABLED`, `STELLAR_NETWORK`, `STELLAR_HORIZON_URL`, `STELLAR_SOROBAN_RPC_URL`, `CONFESSION_ANCHOR_CONTRACT_ID`, `REPUTATION_BADGES_CONTRACT_ID`, `TIPPING_SYSTEM_CONTRACT_ID`, `STELLAR_SERVER_SECRET`
- Tipping: `TIP_VERIFICATION_STALE_THRESHOLD_MINUTES`
- Analytics to add in Milestone 1: `ANALYTICS_ENABLED`, `ANALYTICS_RETENTION_DAYS`, `TRACTION_CACHE_TTL_SECONDS`

No secret values are documented here.
