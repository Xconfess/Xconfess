# Health Endpoint Quick Reference

The backend exposes two health endpoints under the global `/api` prefix.

## Endpoints

| Endpoint            | Method | Purpose                                                                                                                                                                                                                                     |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/health/live`  | GET    | **Liveness probe** — returns 200 while the Node process is responsive. No external dependency checks. Safe to poll at high frequency.                                                                                                       |
| `/api/health/ready` | GET    | **Readiness probe** — returns 200 only when required dependencies are healthy. Postgres and schema are always checked; Redis and BullMQ queues are strict when `ENABLE_BACKGROUND_JOBS=true`. Returns 503 with per-check detail on failure. |
| `/api/health`       | GET    | Backward-compatible alias for `/api/health/ready`. Prefer `/api/health/ready` for new integrations.                                                                                                                                         |

## Usage

### Quick check during local development

```bash
# Is the backend process alive?
curl http://localhost:5000/api/health/live

# Are all dependencies ready?
curl http://localhost:5000/api/health/ready
```

### Kubernetes / Docker health checks

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

## What gets checked

The readiness probe (`/api/health/ready`) checks:

1. **Database** — Postgres connection via TypeORM ping
2. **Redis** — Redis `PING` when `ENABLE_BACKGROUND_JOBS=true`
3. **Queues** — BullMQ queue worker availability when `ENABLE_BACKGROUND_JOBS=true`
4. **Schema** — Confession table exists and matches expected schema

When `ENABLE_BACKGROUND_JOBS` is not the exact string `"true"`, Redis and queue readiness return `status: "up"` with `mode: "disabled"` and an explanatory `reason`. This keeps local development and CI smoke checks from requiring Redis while still making production job mode strict.

## Response examples

### Healthy (200)

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up", "host": "redis", "port": 6379 },
    "queues": { "status": "up" },
    "schema": { "status": "up" }
  }
}
```

### Jobs disabled (200)

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": {
      "status": "up",
      "mode": "disabled",
      "reason": "ENABLE_BACKGROUND_JOBS is set to \"false\" (Redis readiness intentionally disabled)",
      "severity": "info"
    },
    "queues": {
      "status": "up",
      "mode": "disabled",
      "reason": "ENABLE_BACKGROUND_JOBS is set to \"false\" (background jobs intentionally disabled)",
      "severity": "info"
    },
    "schema": { "status": "up" }
  }
}
```

### Unhealthy (503)

```json
{
  "status": "error",
  "info": {
    "database": { "status": "up" }
  },
  "error": {
    "redis": {
      "status": "down",
      "host": "redis",
      "port": 6379,
      "error": "ECONNREFUSED",
      "hint": "Verify REDIS_HOST, REDIS_PORT, and that Redis is reachable when ENABLE_BACKGROUND_JOBS=true."
    }
  },
  "details": {
    "redis": {
      "status": "down",
      "host": "redis",
      "port": 6379,
      "error": "ECONNREFUSED"
    }
  }
}
```

## Rate limits

- `/api/health/live`: 120 requests per minute
- `/api/health/ready`: 30 requests per minute

These limits are intentionally generous for local development. In production, use your load balancer's health check interval (typically 10-30 seconds).
