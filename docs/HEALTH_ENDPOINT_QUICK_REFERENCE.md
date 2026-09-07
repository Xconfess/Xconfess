# Health Endpoint Quick Reference

The backend exposes health endpoints under the global `/api` prefix.

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health/live` | GET | **Liveness probe** — returns 200 while the Node process is responsive. No external dependency checks. Safe to poll at high frequency. |
| `/api/health/ready` | GET | **Readiness probe** — returns 200 only when Postgres, Redis, BullMQ queues, and confession-table schema are all healthy. Returns 503 with per-check detail on failure. |
| `/api/health/status` | GET | **State classification** — returns a flat JSON object with a `state` field: `live`, `ready`, `disabled`, `degraded`, or `down`. Use for dashboards and alerting. |
| `/api/health` | GET | Backward-compatible alias for `/api/health/ready`. Prefer `/api/health/ready` for new integrations. |

## Usage

### Quick check during local development

```bash
# Is the backend process alive?
curl http://localhost:5000/api/health/live

# Are all dependencies ready?
curl http://localhost:5000/api/health/ready
```

### Docker Compose health checks

The default Compose stack runs Postgres and Redis only. Their container health
checks verify that each dependency accepts connections; they do not prove that
the application can serve traffic.

Start the opt-in backend profile when you need Docker to report the same
readiness decision as the deployed backend:

```bash
docker compose -f compose.yaml --profile app up --build
docker compose -f compose.yaml --profile app ps
```

`xconfess-backend` is healthy only when `GET /api/health/ready` returns `200`.
Its healthcheck therefore includes database connectivity, Redis and BullMQ
health (when enabled), and the confession-schema check. A `503` response leaves
the container unhealthy; use the response body to identify the failed check.

### Kubernetes health checks

```yaml
# Liveness — restart the pod if the process is unresponsive
livenessProbe:
  httpGet:
    path: /api/health/live
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 10

# Readiness — stop routing traffic if dependencies are down
readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 5000
  initialDelaySeconds: 10
  periodSeconds: 15
```

### Building the backend

```bash
npm run backend:build
```

## What gets checked

The readiness probe (`/api/health/ready`) checks:

1. **Database** — Postgres connection via TypeORM ping
2. **Redis** — Redis connection health. Conditioned on `ENABLE_BACKGROUND_JOBS=true`; returns `mode: disabled` when jobs are off.
3. **Queues** — BullMQ queue worker availability and lightweight connection latency. Conditioned on `ENABLE_BACKGROUND_JOBS=true`; returns `mode: disabled` when jobs are off.
   - Measures lightweight latency using a Redis ping on each queue client.
   - Configurable latency threshold via `REDIS_QUEUE_LATENCY_THRESHOLD_MS` (defaults to `250` ms). Latencies exceeding this threshold will mark the queue as `'degraded'` and fail the readiness check (returning 503).
4. **Schema** — Confession table exists and matches expected schema

## Degraded dependency behavior

| Dependency or configuration | Readiness result | Operator action |
| --- | --- | --- |
| Postgres unavailable | `503`; `database` is down | Restore Postgres connectivity and confirm migrations/schema are current. |
| Redis unavailable with `ENABLE_BACKGROUND_JOBS=true` | `503`; `redis` is down | Restore Redis before accepting traffic that relies on jobs. |
| Queue workers absent or Redis latency exceeds the configured threshold | `503`; `queues` is down/degraded | Start the workers or correct the Redis/queue problem. |
| `ENABLE_BACKGROUND_JOBS` is not exactly `true` | Redis and queue checks report `mode: disabled` and do not fail readiness | Appropriate only when background jobs are intentionally disabled. Set it to `true` in deployed environments that use jobs. |

The Compose backend profile sets `ENABLE_BACKGROUND_JOBS=true`, so a Redis or
queue failure makes its Docker health state unhealthy. This matches the
production readiness contract instead of treating Redis merely as a running
container.

## Response examples

### Healthy (200)

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "queues": {
      "status": "up",
      "notifications": {
        "status": "up",
        "workers": 1,
        "counts": { "active": 0, "waiting": 0, "failed": 0, "delayed": 0 },
        "latencyMs": 12
      }
    },
    "schema": { "status": "up" }
  }
}
```

### Unhealthy (503) - Unavailable or Degraded Queue

```json
{
  "status": "error",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  },
  "error": {
    "queues": {
      "status": "down",
      "notifications": {
        "status": "degraded",
        "workers": 1,
        "counts": { "active": 0, "waiting": 0, "failed": 0, "delayed": 0 },
        "latencyMs": 350
      }
    }
  },
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "queues": {
      "status": "down",
      "notifications": {
        "status": "degraded",
        "workers": 1,
        "counts": { "active": 0, "waiting": 0, "failed": 0, "delayed": 0 },
        "latencyMs": 350
      }
    }
  }
}
```

## Health State Classification (`/api/health/status`)

Returns a flat JSON object for machine consumption:

| `state` | Meaning | Action |
|---------|---------|--------|
| `live` | Process responsive (liveness only) | None — normal |
| `ready` | All dependencies healthy | None — normal |
| `disabled` | Optional deps intentionally off | Expected in dev without Redis |
| `degraded` | Non-critical dependency degraded | Monitor; investigate if persistent |
| `down` | Critical dependency unreachable | Immediate action required |

```json
{
  "state": "ready",
  "timestamp": "2026-08-30T12:00:00.000Z",
  "checks": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "queues": { "status": "up" },
    "schema": { "status": "up" }
  }
}
```

```json
{
  "state": "degraded",
  "timestamp": "2026-08-30T12:00:00.000Z",
  "checks": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "queues": { "status": "down" },
    "schema": { "status": "up" }
  }
}
```

## Rate limits

- `/api/health/live`: 120 requests per minute
- `/api/health/ready`: 30 requests per minute
- `/api/health/status`: 30 requests per minute

These limits are intentionally generous for local development. In production, use your load balancer's health check interval (typically 10-30 seconds).