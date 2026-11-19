# Local Environment Variables

This is the reference for the environment variables used by the backend and
frontend in local development: what each variable is for, the expected format,
and whether it is a **secret** that must never be committed or shared.

- Backend file: `xconfess-backend/.env` (copy from `xconfess-backend/.env.example`)
- Frontend file: `xconfess-frontend/.env.local` (copy from `xconfess-frontend/.env.example`)

> **Never commit `.env` or `.env.local`.** Only the `.env.example` templates
> are tracked. The values shown below are clearly fake local placeholders — do
> not reuse them outside a local sandbox and never replace them with real
> credentials in a tracked file.
>
> Generate real secrets with `openssl rand -base64 48` (or `/dev/urandom`) and
> keep them in a git-ignored file or a secret manager.

For the full first-run walkthrough see the [README](../README.md) and the
[Contributor Guide](./CONTRIBUTOR_GUIDE.md).

## Backend variables

`xconfess-backend/.env` is validated at boot by
`src/config/env.validation.ts`. Missing or malformed required variables stop the
process with an actionable error.

### Required backend variables

| Variable | Format / example (fake) | Secret? | Purpose |
|----------|-------------------------|:-------:|---------|
| `DB_HOST` | `localhost` | No | PostgreSQL host. |
| `DB_PORT` | `55432` | No | PostgreSQL port (`compose.yaml` maps 55432). |
| `DB_USERNAME` | `postgres` | No | PostgreSQL user. |
| `DB_PASSWORD` | `postgres` (may be empty locally) | **Yes** | PostgreSQL password. |
| `DB_NAME` | `xconfess` | No | PostgreSQL database name. |
| `JWT_SECRET` | any random string ≥ 32 chars | **Yes** | Signs auth tokens. Must be ≥ 32 chars. |
| `CONFESSION_ENCRYPTION_KEY` | 64-char hex, e.g. `0123...` (not all zeros) | **Yes** | Encrypts confession content. |
| `ENCRYPTION_MASTER_KEY_v1` | 64-char hex, e.g. `0123...` (not all zeros) | **Yes** | Envelope-encryption master key. |
| `APP_SECRET` | any random string ≥ 32 chars | **Yes** | App-level HMAC secret. Optional locally, **required** in `staging`/`production`. |

### Optional backend variables (safe local defaults)

| Variable | Default | Secret? | Purpose |
|----------|---------|:-------:|---------|
| `NODE_ENV` | `development` | No | Runtime environment (`development`/`test`/`production`/`staging`). |
| `APP_ENV` | — | No | Alternate environment label. |
| `PORT` | `3000` | No | Backend HTTP port (compose/README use `5000`). |
| `FRONTEND_URL` | `http://localhost:3000` | No | Allowed CORS/WebSocket origin. |
| `CORS_ALLOWED_ORIGINS` | falls back to `FRONTEND_URL` | No | Comma-separated browser origins allowed to make credentialed API requests. Wildcards (`*`) are rejected at startup. |
| `BACKEND_URL` | — | No | Public backend URL (used in links/emails). |
| `DB_READ_HOST` / `DB_READ_PORT` | falls back to primary | No | Read-replica host/port. |
| `DB_READ_REPLICAS` | `1` | No | Read-replica count for pool sizing. |
| `DB_POOL_MAX` / `DB_POOL_MIN` | env-specific | No | Connection-pool bounds. |
| `DB_IDLE_TIMEOUT_MS` / `DB_CONN_TIMEOUT_MS` | env-specific | No | Pool timeouts. |
| `TYPEORM_SYNCHRONIZE` | `false` | No | Auto-sync schema. Local only. |
| `TYPEORM_MIGRATIONS_RUN` | `false` (`true` in prod) | No | Run migrations on boot. |
| `ENCRYPTION_CURRENT_KEY_VERSION` | `v1` | No | Active envelope key version (`v1`, `v2`, …). |
| `EMAIL_ENCRYPTION_KEY` | test-only 32-byte string | **Yes** | Encrypts stored email fields. |
| `ENABLE_BACKGROUND_JOBS` | `false` | No | Enable BullMQ workers (notifications/exports/drafts). |
| `GRACEFUL_SHUTDOWN_TIMEOUT_MS` | `30000` | No | Total shutdown budget. |
| `WORKER_DRAIN_TIMEOUT_MS` | `15000` | No | Budget reserved to drain active jobs. |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | No | Redis connection for queues/cache. |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | `900` / `100` | No | Global throttling window/limit. |
| `RATE_LIMIT_POST_MAX` / `_WINDOW` | `5` / `60` | No | POST rate limiting. |
| `RATE_LIMIT_GET_MAX` / `_WINDOW` | `50` / `60` | No | GET rate limiting. |
| `ANALYTICS_ENABLED` | `true` | No | Toggle privacy-safe analytics. |
| `ANALYTICS_RETENTION_DAYS` | `365` | No | Analytics retention. |
| `TRACTION_CACHE_TTL_SECONDS` | `60` | No | Public traction metric cache TTL. |
| `TRACTION_EXCLUDED_*_IDS` | empty | No | Comma-separated IDs excluded from public aggregates. |
| `EXPORT_RETENTION_DAYS` | `7` | No | Data-export artifact retention. |
| `EXPORT_AUDIT_CLEANUP_ACTIONS` | `true` | No | Clean up export audit rows. |
| `TIP_VERIFICATION_STALE_THRESHOLD_MINUTES` | `30` | No | Tip stale-pending SLA. |
| `DLQ_RETENTION_DAYS` / `DLQ_CLEANUP_BATCH_SIZE` | `14` / `100` | No | Dead-letter queue cleanup. |
| `DLQ_CLEANUP_DRY_RUN` | `false` | No | Dry-run DLQ cleanup. |
| `DLQ_AUTO_REPLAY_ENABLED` | `false` | No | Enable automatic DLQ replay. |
| `CB_FAILURE_THRESHOLD` / `CB_COOLDOWN_SECONDS` / `CB_PROBE_SUCCESS_THRESHOLD` | `3` / `60` / `2` | No | Mail circuit-breaker tuning. |

### Email variables (optional — mail is skipped when unconfigured)

| Variable | Format / example (fake) | Secret? | Purpose |
|----------|-------------------------|:-------:|---------|
| `MAIL_HOST` / `MAIL_PORT` | `smtp.example.com` / `587` | No | SMTP server. |
| `MAIL_SECURE` | `false` | No | Use TLS. |
| `MAIL_USER` | `your-smtp-username` | **Yes** | SMTP username. |
| `MAIL_PASSWORD` | `your-smtp-password` | **Yes** | SMTP password. |
| `MAIL_FROM` | `noreply@xconfess.com` | No | From address. |
| `MAIL_FALLBACK_HOST` / `_PORT` / `_SECURE` / `_USER` / `_PASSWORD` / `_FROM` | empty | Mixed (`_USER`/`_PASSWORD` are **secrets**) | Fallback SMTP transport. |

### Stellar / Soroban variables (optional)

Stellar is disabled by default (`STELLAR_FEATURES_ENABLED=false`). See the
inline guidance in `xconfess-backend/.env.example` and
[docs/stellar-feature-flag-matrix.md](./stellar-feature-flag-matrix.md) for the
feature-flag matrix.

| Variable | Format / example (fake) | Secret? | Purpose |
|----------|-------------------------|:-------:|---------|
| `STELLAR_FEATURES_ENABLED` | `false` | No | Master switch for on-chain features. |
| `STELLAR_NETWORK` | `testnet` | No | `testnet` or `mainnet`; must match deployment metadata. |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | No | Horizon endpoint for the selected network. Testnet must use `horizon-testnet.stellar.org`; mainnet must use `horizon.stellar.org`. |
| `STELLAR_SOROBAN_RPC_URL` | `https://soroban-rpc-testnet.stellar.org` | No | Soroban RPC endpoint for the selected network. Testnet must use `soroban-rpc-testnet.stellar.org`; mainnet must use `soroban-rpc.mainnet.stellar.org`. |
| `CONFESSION_ANCHOR_CONTRACT_ID` | `C...` (public key) | No | Anchor contract ID. |
| `REPUTATION_BADGES_CONTRACT_ID` | `C...` (public key) | No | Reputation contract ID. |
| `TIPPING_SYSTEM_CONTRACT_ID` | `C...` (public key) | No | Tipping contract ID. |
| `STELLAR_SERVER_SECRET` | `S...` (56 chars) | **Yes** | Server signing keypair (testnet only locally). |
| `ENABLE_TESTNET_FUNDING` | `false` | No | Opt-in to Friendbot funding. |

## Frontend variables

`xconfess-frontend/.env.local` is read by Next.js
(`xconfess-frontend/.env.example` is the template).

> **Public vs private prefix.** Variables prefixed with `NEXT_PUBLIC_` are
> embedded into the browser bundle and are effectively public. Everything
> without that prefix (`BACKEND_API_URL`, `STRICT_ENV_VALIDATION`) is
> **server-only** and must not hold credentials the browser should never see.

### Frontend variables

| Variable | Format / example (fake) | Exposed to browser? | Purpose |
|----------|-------------------------|:-------------------:|---------|
| `BACKEND_API_URL` | `http://localhost:5000/api` | No (server-only) | Target for Next.js server-side API proxy routes. Required in production. |
| `STRICT_ENV_VALIDATION` | `false` | No (server-only) | Fail fast when required frontend vars are missing. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000/api` | Yes | Browser → backend API base URL. |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:5000` | Yes | Browser → backend WebSocket URL. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Yes | Canonical app URL for links/share. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Yes | Site URL for metadata. |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` | Yes | Wallet network. |
| `NEXT_PUBLIC_STELLAR_CONTRACT_ID` (alias `NEXT_PUBLIC_CONTRACT_ID`) | `C...` | Yes | Public contract ID. |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | Yes | Horizon endpoint. |
| `NEXT_PUBLIC_STELLAR_RPC_URL` / `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL` | `https://soroban-rpc-testnet.stellar.org` | Yes | Soroban RPC endpoints. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | empty locally | Yes | WalletConnect project ID (public identifier, still keep it out of logs). |
| `NEXT_PUBLIC_ERROR_TRACKING_URL` | empty | Yes | Error-reporting collector URL. |
| `NEXT_PUBLIC_DEBUG_NOTIFICATIONS` | `false` | Yes | Verbose notification debugging. |
| `NEXT_PUBLIC_DEV_BYPASS_AUTH` | `false` | Yes | **Dev only** — bypass auth checks. Never enable in production. |
| `NEXT_PUBLIC_DEV_MOCK_ROLE` | `user` | Yes | **Dev only** — mock role when bypass is on. |
| `NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN` | `false` | Yes | **Dev only** — mock admin login. |

## Secrets vs non-secret configuration

**Secrets — never commit, log, screenshot, or paste into issues/PRs:**

- `DB_PASSWORD`
- `JWT_SECRET`, `APP_SECRET`
- `CONFESSION_ENCRYPTION_KEY`, `ENCRYPTION_MASTER_KEY_v1`, `EMAIL_ENCRYPTION_KEY`
- `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FALLBACK_USER`, `MAIL_FALLBACK_PASSWORD`
- `STELLAR_SERVER_SECRET`

**Non-secret configuration — safe to commit in `.env.example`:**

- Hosts, ports, database/user names
- URLs (`FRONTEND_URL`, `BACKEND_URL`, `NEXT_PUBLIC_*_URL`, `*_RPC_URL`)
- Public contract IDs and network names
- Feature flags, TTLs, thresholds, retention windows, pool sizes

## Format rules

- One `KEY=value` per line; do not wrap values in quotes unless the value
  contains spaces.
- Secrets are opaque strings — keep them unquoted and out of shell history.
- Booleans are lowercase `true` / `false`.
- Comma-separated lists (for example `TRACTION_EXCLUDED_USER_IDS`) use no spaces.
- If you change a secret locally, restart the backend so the new value is
  picked up.
