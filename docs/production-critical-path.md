# Production critical path

This checklist covers the failure modes that blocked the first Vercel and Render deploys.

## Required deploy gates

Run these before promoting a deploy:

```bash
npm run deploy:preflight
npm run backend:build
npm run frontend:build
npm run contracts:verify-env
```

After deploy, run:

```bash
SMOKE_FRONTEND_URL=https://xconfess.vercel.app \
SMOKE_BACKEND_URL=https://xconfess-backend.onrender.com \
npm run deploy:smoke
```

Set `SMOKE_RUN_MUTATION=true` only when you want the smoke test to create a disposable registration account.

## API contract

The canonical browser-to-production auth path is:

| Browser route | Next.js proxy target | Backend route | Methods |
| --- | --- | --- | --- |
| `/api/users/register` | `BACKEND_API_URL/users/register` | `/api/users/register` | `POST` |
| `/api/auth/session` | `BACKEND_API_URL/auth/session` | `/api/auth/session` | `GET` |
| `/api/auth/session` | `BACKEND_API_URL/auth/me` | `/api/auth/me` | fallback `GET` |
| `/api/auth/session` | `BACKEND_API_URL/auth/login` | `/api/auth/login` | `POST` |

`BACKEND_API_URL` and `NEXT_PUBLIC_API_URL` must both point to the Render backend and include `/api`.
Never point either value at `https://xconfess.vercel.app/api`.

## Render schema policy

Production deploys must use migrations:

```env
TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=true
```

`TYPEORM_SYNCHRONIZE=true` is allowed only in local development. The backend now refuses to boot with production sync enabled.

Because the first Render database may have been created by TypeORM synchronize, Render runs `npm run render:prestart` before the backend starts. That script always makes the `anonymous_confessions` readiness indexes idempotently when the table and required columns already exist. It only baselines migrations when all of these are true:

- `TYPEORM_BASELINE_EXISTING_SCHEMA=true`
- `TYPEORM_MIGRATIONS_RUN=true`
- core tables already exist
- the `migrations` table is empty

Fresh databases skip the baseline and run migrations normally. Existing databases with migration history skip only the baseline; the readiness index repair still runs.

## Secrets

Generate production secrets with:

```bash
openssl rand -base64 48 # JWT_SECRET, APP_SECRET
openssl rand -hex 32    # CONFESSION_ENCRYPTION_KEY, ENCRYPTION_MASTER_KEY_v1
```

All-zero development keys are blocked. When `STELLAR_FEATURES_ENABLED=true` in production, `STELLAR_SERVER_SECRET` must be a valid Stellar secret seed.

## Render cold starts

The production backend is hosted on [Render's free tier](https://render.com/docs/free#free-web-services). Free-tier web services **spin down after 15 minutes of inactivity** and are restarted on the next inbound request.

Render uses `/api/health/live` as the deploy health check, so a cold start is judged by whether the Node process is listening. Use `/api/health/ready` after deployment to verify Postgres, Redis queues, and schema readiness before treating the release as healthy. If background jobs are intentionally disabled, readiness reports them as `disabled`; production should keep `ENABLE_BACKGROUND_JOBS=true`.

### What to expect

| Situation | Expected behaviour |
|-----------|-------------------|
| Service has been idle for ≥ 15 minutes | First request may take **50 seconds or more** to return a response |
| Service is already warm | Requests respond at normal latency (typically < 500 ms) |
| Cold start in progress | HTTP connection hangs until the instance is ready — do not cancel early |

This is **not a broken deploy**. It is an intentional trade-off of the free hosting tier.

### Validating a fresh deploy or waking a cold instance

Poll the health endpoints until you receive a `200` response. Use `/api/health/live` first (fastest — no dependency checks), then `/api/health/ready` to confirm all dependencies are up.

```bash
# Replace <your-render-host> with the actual Render hostname, e.g. xconfess-api.onrender.com

# 1. Check the process is alive (liveness probe — no DB/Redis checks)
curl -i https://<your-render-host>/api/health/live

# 2. Check all dependencies are ready (readiness probe — DB, Redis, queues, schema)
curl -i https://<your-render-host>/api/health/ready
```

Both endpoints return `200 OK` with a JSON body when healthy. See [HEALTH_ENDPOINT_QUICK_REFERENCE.md](HEALTH_ENDPOINT_QUICK_REFERENCE.md) for full response schemas and rate-limit information.

### Scripted wait loop

If you need to automate a wait (e.g., in a CI smoke-test or a deployment script), use a retry loop:

```bash
#!/usr/bin/env bash
set -euo pipefail

HOST="${RENDER_HOST:?Set RENDER_HOST to your Render hostname}"
TIMEOUT=120  # seconds — cold start should complete well within 2 minutes
INTERVAL=10

echo "Waiting for $HOST to wake up..."
elapsed=0
until curl -sf "https://${HOST}/api/health/live" > /dev/null; do
  if (( elapsed >= TIMEOUT )); then
    echo "ERROR: backend did not respond within ${TIMEOUT}s" >&2
    exit 1
  fi
  echo "  still waiting... (${elapsed}s elapsed)"
  sleep "$INTERVAL"
  (( elapsed += INTERVAL ))
done
echo "Backend is alive after ${elapsed}s. Checking readiness..."

until curl -sf "https://${HOST}/api/health/ready" > /dev/null; do
  echo "  waiting for dependencies..."
  sleep "$INTERVAL"
done
echo "Backend is ready."
```

### Common mistakes

- **Cancelling the request too early** — a cold-starting instance will hold the connection open. Wait at least 60 seconds before concluding the request has failed.
- **Assuming a timeout means a bad deploy** — check the health endpoints and Render's dashboard logs before rolling back.
- **Using `/api/health/ready` for a liveness check** — this endpoint checks Postgres, Redis, and queues, and will return `503` if any dependency is down, even when the process itself is healthy. Use `/api/health/live` for a fast "is the process up?" check.

## Related docs

- [Health Endpoint Quick Reference](HEALTH_ENDPOINT_QUICK_REFERENCE.md) — endpoint reference, Kubernetes probe configs, and response schemas
- [Incident Runbook](incident-runbook.md) — general production incident response
- [Disaster Recovery Runbook](disaster-recovery-runbook.md) — data recovery procedures
