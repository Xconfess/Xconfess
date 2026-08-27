# Health Check Documentation

> **Wave 5 — XConfess Backend**
> Covers `/api/health/live`, `/api/health/ready`, and the legacy `/api/health` alias for local smoke tests and production readiness checks.

---

## Overview

The XConfess backend exposes three health endpoints. They serve distinct purposes and have different failure semantics:

| Endpoint | Purpose | Rate limit | Strictness |
|---|---|---|---|
| `GET /api/health/live` | Confirms the Node process is responsive | 120 req/min | Lenient — no dependency checks |
| `GET /api/health/ready` | Confirms all dependencies are operational | 120 req/min | Strict — fails if any check fails |
| `GET /api/health` | Backward-compatible alias for `/ready` | 120 req/min | Same as `/ready` |

Use **liveness** for a quick local smoke test after starting the server. Use **readiness** to verify the full stack before routing real traffic, running migrations, or marking a deployment as successful. Prefer `/ready` over the bare `/health` alias for new integrations.

---

## Endpoint Reference

### `GET /api/health/live`

**What it checks**

Nothing external. The controller returns a static response directly — no `HealthCheckService`, no database ping, no Redis call. If this endpoint responds, the Node process is alive.

**Response — healthy**

```json
{ "status": "ok" }
```

**HTTP status:** `200 OK`

**Response — unhealthy**

The process is not running or the HTTP layer has crashed. The endpoint will not respond — the TCP connection will be refused or time out.

**When to use it**

- Quick sanity check after `npm run start:dev`
- Kubernetes liveness probe (triggers container restart)
- CI pipeline: "did the server come up?"
- Safe to poll at high frequency (120 req/min limit)

**curl example**

```bash
curl -i http://localhost:3000/api/health/live
```

**PowerShell example**

```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/health/live -UseBasicParsing
```

Expected output:

```
HTTP/1.1 200 OK
...
{"status":"ok"}
```

---

### `GET /api/health/ready`

**What it checks**

Runs four health indicators in sequence via NestJS Terminus:

 1. **`database`** — TypeORM `pingCheck` against Postgres
 2. **`redis`** — custom `RedisHealthIndicator.isHealthy()`
 3. **`queues`** — custom `QueueHealthIndicator.isHealthy()` (BullMQ workers). Returns `mode: 'disabled'` when `ENABLE_BACKGROUND_JOBS !== 'true'` — see Queue health troubleshooting below.
 4. **`schema`** — custom `SchemaReadinessHealthIndicator.isHealthy()` — validates the `anonymous_confessions` table has all required columns and indexes via `MigrationVerificationService.checkConfessionSchema()`

 All four must pass for the endpoint to return `200 OK` (the queues check "passes" either by having healthy workers or by being explicitly disabled). A single non-disabled failure causes the whole probe to return `503 Service Unavailable` with per-check detail in the body.

**Response — all healthy**

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis":    { "status": "up" },
    "queues":   { "status": "up" },
    "schema":   { "status": "up", "table": "anonymous_confessions", "columns": "required present", "indexes": "required present" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "redis":    { "status": "up" },
    "queues":   { "status": "up" },
    "schema":   { "status": "up", "table": "anonymous_confessions", "columns": "required present", "indexes": "required present" }
  }
}
```

**HTTP status:** `200 OK`

**Response — schema failure (missing columns or indexes)**

```json
{
  "status": "error",
  "info": {
    "database": { "status": "up" },
    "redis":    { "status": "up" },
    "queues":   { "status": "up" }
  },
  "error": {
    "schema": {
      "status": "down",
      "missingColumns": [],
      "missingIndexes": ["idx_confessions_feed_perf"]
    }
  },
  "details": {
    "database": { "status": "up" },
    "redis":    { "status": "up" },
    "queues":   { "status": "up" },
    "schema":   { "status": "down", "missingColumns": [], "missingIndexes": ["idx_confessions_feed_perf"] }
  }
}
```

**Response — schema query error**

```json
{
  "error": {
    "schema": {
      "status": "down",
      "error": "relation \"anonymous_confessions\" does not exist"
    }
  }
}
```

**HTTP status:** `503 Service Unavailable` for both failure cases above.

**When to use it**

- Pre-deployment gate: "is the stack ready to serve traffic?"
- Kubernetes readiness probe (removes pod from load-balancer rotation)
- Post-migration verification
- Integration test `beforeAll` hooks that wait for the stack to be ready

**curl example**

```bash
curl -i http://localhost:3000/api/health/ready
```

**PowerShell example**

```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/health/ready -UseBasicParsing
```

Expected output when fully healthy:

```
HTTP/1.1 200 OK
...
{"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"},"queues":{"status":"up"},"schema":{"status":"up",...}}}
```

---

### `GET /api/health` (legacy alias)

Runs the identical four checks as `/ready`. Exists for backward compatibility with clients that called the bare `/health` path before `/ready` was introduced. **New integrations should use `/api/health/ready`.**

---

## Why Readiness Can Fail When Optional Local Indexes Are Missing

The `SchemaReadinessHealthIndicator` delegates to `MigrationVerificationService.checkConfessionSchema()`, which queries the Postgres catalog to assert that the `anonymous_confessions` table has every column and index that the migrations declare as required.

In local development this check can fail if:

- You have not run all pending migrations (`npm run migration:run`)
- A migration was merged after your last `git pull` and you have not re-run migrations
- Your local Postgres was restored from a dump that predates the index migrations (notably `20260126-add-performance-indexes.ts` and `20260423000001-add-feed-search-performance-indexes.ts`)

**This behavior is intentional.** The indexes are optional for query correctness — Postgres will execute queries without them — but they are required for acceptable performance under load. The health check enforces their presence so a missing migration is caught at startup rather than silently degrading production query times.

When the check fails it reports two distinct arrays:

- `missingColumns` — columns that must exist on `anonymous_confessions`
- `missingIndexes` — indexes that must exist on `anonymous_confessions`

If `queryError` is set instead, the table itself cannot be queried (usually means migrations have never been run or the database is wrong).

**Fix:**

```bash
# Apply all outstanding migrations
npm run migration:run

# Confirm the readiness probe now passes
curl -s http://localhost:3000/api/health/ready | jq .status
# expected: "ok"
```

---

## Troubleshooting

### Postgres connection failure

**Symptom**

```json
"database": { "status": "down", "message": "connect ECONNREFUSED 127.0.0.1:5432" }
```

**Causes and fixes**

| Cause | Fix |
|---|---|
| Postgres is not running | `pg_ctl start` or `docker compose up -d db` |
| Wrong host / port in `.env` | Check `DB_HOST`, `DB_PORT` match your local instance |
| Wrong credentials | Check `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` in `.env` |
| SSL mismatch | Set `DB_SSL=false` for local development |

**Verify Postgres directly**

```bash
psql -h 127.0.0.1 -U <DB_USERNAME> -d <DB_NAME> -c "SELECT 1;"
```

---

### Redis connection failure

**Symptom**

```json
"redis": {
  "status": "down",
  "host": "localhost",
  "port": 6379,
  "error": "connect ECONNREFUSED 127.0.0.1:6379"
}
```

**Causes and fixes**

| Cause | Fix |
|---|---|
| Redis is not running | `redis-server` or `docker compose up -d redis` |
| Wrong host / port in `.env` | Check `REDIS_HOST`, `REDIS_PORT` |
| Auth required but not configured | Set `REDIS_PASSWORD` in `.env` |
| Redis bound to wrong interface | Check `bind` directive in `redis.conf` |

**Verify Redis directly**

```bash
redis-cli ping
# expected: PONG
```

**Note:** The Redis check only runs when `ENABLE_BACKGROUND_JOBS=true`. When background jobs are disabled, the indicator returns `{ status: 'up', mode: 'disabled' }` and does not attempt to contact Redis.

---

### Queue health failure

**Symptom**

```json
"queues": { "status": "down" }
```

**Causes and fixes**

| Cause | Fix |
|---|---|
| Redis is down (queue depends on it) | Fix Redis first — see section above |
| BullMQ workers not started | Ensure the app boots with workers enabled |
| Stalled jobs blocking the queue | Inspect via Bull Board or drain manually |

> **Note:** The key in the response body is `queues` (plural), matching the `key` argument passed in the controller. Use this when grepping logs or writing alerting rules.

---

### Redis health — disabled mode (local development)

When `ENABLE_BACKGROUND_JOBS` is **not** set to the exact string `"true"`, the Redis health indicator returns a `disabled` mode instead of attempting a Redis PING. This prevents the readiness probe from failing in environments where Redis is intentionally absent (e.g. local development or CI pipelines that don't need background jobs).

**Response — disabled**

```json
"redis": {
  "status": "up",
  "mode": "disabled",
  "reason": "ENABLE_BACKGROUND_JOBS is not set (defaults to disabled)",
  "severity": "info"
}
```

**How to interpret the reason field**

| `ENABLE_BACKGROUND_JOBS` value | Reason message includes | Meaning |
|---|---|---|
| `"false"` | `"intentionally disabled"` | Dev/CI — expected and fine |
| `undefined` / not set | `"not set (defaults to disabled)"` | Might be accidental in production |
| `"true"` | *(no disabled mode — Redis PING is performed)* | Production — Redis expected |
| Any other value | `expected "true" to enable"` | Likely a typo — fix to `"true"` |

> **Important for production:** Always set `ENABLE_BACKGROUND_JOBS=true` in production environments. Omitting this variable causes the readiness probe to skip the Redis check entirely — the probe will pass even if Redis is down.

### Queue health — disabled mode (local development)

When `ENABLE_BACKGROUND_JOBS` is **not** set to the exact string `"true"`, the queue health indicator returns a `disabled` mode instead of checking individual queues. This prevents the readiness probe from failing in environments where BullMQ workers are intentionally absent (e.g. local development without Redis, or CI pipelines that only need the HTTP layer).

**Response — disabled (intentional, `"false"`)**

```json
"queues": {
  "status": "up",
  "mode": "disabled",
  "reason": "ENABLE_BACKGROUND_JOBS is set to \"false\" (background jobs intentionally disabled)",
  "severity": "info"
}
```

**Response — disabled (not configured)**

```json
"queues": {
  "status": "up",
  "mode": "disabled",
  "reason": "ENABLE_BACKGROUND_JOBS is not set (defaults to disabled)",
  "severity": "info"
}
```

**Response — disabled (misconfigured)**

```json
"queues": {
  "status": "up",
  "mode": "disabled",
  "reason": "ENABLE_BACKGROUND_JOBS is set to \"yes\" (expected \"true\" to enable)",
  "severity": "info"
}
```

**How to interpret the reason field**

| `ENABLE_BACKGROUND_JOBS` value | Reason message includes | Meaning |
|---|---|---|
| `"false"` | `"intentionally disabled"` | Dev/CI — expected and fine |
| `undefined` / not set | `"not set (defaults to disabled)"` | Might be accidental in production |
| `"true"` | *(no disabled mode — queues are checked)* | Production — workers expected |
| Any other value | `expected "true" to enable` | Likely a typo — fix to `"true"` |

> **Important for production:** Always set `ENABLE_BACKGROUND_JOBS=true` in production environments. Omitting this variable (or setting it to anything other than `"true"`) causes the readiness probe to skip queue checks entirely — the probe will pass even if all workers are down.

**Local vs production expectations**

| Environment | `ENABLE_BACKGROUND_JOBS` | Queue health behavior |
|---|---|---|
| **Production** | `"true"` | Checks all 4 queues; fails probe if any worker-required queue has 0 workers |
| **Staging** | `"true"` | Same as production — verifies workers are healthy before deployment |
| **Local dev** | `"false"` (or unset) | Skips queue checks; readiness probe passes without Redis/BullMQ |
| **CI pipeline** | `"false"` (or unset) | Avoids false failures when Redis is unavailable in CI |

**Startup guard:** When `ENABLE_BACKGROUND_JOBS` is `"true"` but `REDIS_HOST` or `REDIS_PORT` is missing, the application **refuses to start** with a clear error message. This prevents a misconfigured production deployment from silently losing background job functionality.

---

### Schema readiness failure

**Symptom**

```json
"schema": { "status": "down", "missingColumns": [...], "missingIndexes": [...] }
```

or

```json
"schema": { "status": "down", "error": "relation \"anonymous_confessions\" does not exist" }
```

**Fix**

```bash
npm run migration:run
```

If migrations fail:

- Run `npm run migration:show` to identify pending migrations
- Check for manual schema changes that conflict with a migration
- In a dev environment only: drop and recreate the conflicting table, then rerun migrations

---

## Local Quick-Start Checklist

```bash
# 1. Start dependencies
docker compose up -d db redis

# 2. Install packages (if needed)
npm install

# 3. Run all migrations
npm run migration:run

# 4. Start the dev server
npm run start:dev

# 5. Smoke test — liveness (process up, no dependencies needed)
curl -s http://localhost:3000/api/health/live
# expected: {"status":"ok"}

# 6. Full readiness check (all four indicators must be "up")
curl -s http://localhost:3000/api/health/ready | jq .status
# expected: "ok"
```

---

## File Reference

| File | Role |
|---|---|
| `src/health/health.controller.ts` | Route handlers for `/live`, `/ready`, and the `/health` alias |
| `src/health/health.module.ts` | Registers health indicators and wires `TerminusModule` |
| `src/health/redis.health.ts` | Custom Redis health indicator — pings Redis via ioredis; conditioned on `ENABLE_BACKGROUND_JOBS` |
| `src/health/queue.health.ts` | Custom BullMQ queue health indicator |
| `src/health/schema-readiness.health.ts` | Delegates to `MigrationVerificationService` to validate `anonymous_confessions` schema |
| `src/database/migration-verification.service.ts` | Queries Postgres catalog for required columns and indexes |

---

*Part of XConfess Wave 5 — Stellar Wave program.*
