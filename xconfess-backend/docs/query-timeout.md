# DB Query Timeout for Public Feed Reads

## Overview
Feed and confession list endpoints are the most expensive read paths in the API.
Without a timeout, a slow or missing index on a high-traffic query can hold a
PostgreSQL connection open indefinitely, exhausting the connection pool and
cascading failures across the service.

The `QueryTimeoutInterceptor` (`src/common/query-timeout.interceptor.ts`)
applies per-route read timeouts and converts PostgreSQL `57014` statement-timeout
errors into a controlled `408 RequestTimeout` response.

## Per-route Timeouts

| Route pattern      | Timeout |
|--------------------|---------|
| `/feed`, `/confessions` | **15 s** |
| `/search`          | **20 s** |
| All other routes   | **30 s** |

## Operational Configuration

Set the PostgreSQL `statement_timeout` at the session or role level to align
with the application-level timeout.  This ensures timed-out queries release
their connection immediately rather than waiting for the Node.js RxJS timeout
to fire first.

```sql
-- Per role (recommended for the app service account)
ALTER ROLE xconfess_app SET statement_timeout = '15s';

-- Per session via TypeORM extra configuration (compose.yaml / .env)
POSTGRES_EXTRA_OPTS="options='-c statement_timeout=15000'"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_QUERY_TIMEOUT_FEED_MS` | `15000` | Statement timeout for feed/confession list reads |
| `DB_QUERY_TIMEOUT_SEARCH_MS` | `20000` | Statement timeout for search reads |
| `DB_QUERY_TIMEOUT_DEFAULT_MS` | `30000` | Fallback for all other routes |

> **Note**: `DB_QUERY_TIMEOUT_*` variables are read by `QueryTimeoutInterceptor`
> when present; they override the compiled-in defaults without requiring a
> redeploy.

## API Error Response

On timeout, the API returns:

```json
{
  "statusCode": 408,
  "message": "Query timed out after 15000ms. Please try a narrower search or reduce page size.",
  "error": "Request Timeout"
}
```

Clients should back off and retry with a smaller `limit` parameter.
