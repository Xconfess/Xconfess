# Privacy-safe operational metrics

xConfess is an anonymous confession platform, so operational metrics must never
become a side channel that identifies a user or exposes confession content.
This document defines what the metrics measure and the rules every metric
label must follow.

## What is measured

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `xconfess_http_requests_total` | counter | `method`, `route_category`, `status_class` | Throughput and error rate (`status_class="5xx"` / `"4xx"`) |
| `xconfess_http_request_duration_seconds` | histogram | `method`, `route_category`, `status_class` | General API latency |
| `xconfess_feed_queries_total` | counter | `feed_type`, `outcome` | Feed/search throughput and failures (`outcome="error"` means the query threw, including validation errors) |
| `xconfess_feed_query_duration_seconds` | histogram | `feed_type`, `outcome` | Feed query latency, **kept separate** from general API latency |
| `xconfess_db_pool_connections` | gauge | `pool`, `state` | Database connections per pool. `state` is `total` (open), `idle`, `active` (total minus idle) or `max` (configured limit) |
| `xconfess_db_pool_waiting_requests` | gauge | `pool` | Callers waiting for a free database connection right now. Non-zero for sustained periods means the pool is saturated |
| `xconfess_metrics_dropped_series_total` | counter | none | Safety valve: label combinations dropped by the series cap |

Database pool gauges are read from the driver each time `GET /api/metrics` is
scraped, so they always show the current state rather than a running total.

Feed latency is measured around the service-level query (including the cache
lookup), so it isolates database/cache cost from the rest of the HTTP pipeline
(guards, validation, serialization).

## Allowed label values

Every label takes its value from a **closed list** defined in
`src/observability/metric-labels.ts`:

- `method`: `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `OTHER`
- `status_class`: `1xx`, `2xx`, `3xx`, `4xx`, `5xx`, `other`
- `route_category`: a fixed list such as `confessions_feed`, `confessions_search`,
  `confessions_trending`, `auth`, `admin`, `health`, `other`, ...
- `feed_type`: `public`, `search`, `fulltext_search`, `trending`, `tag`, `other`
- `outcome`: `success`, `error`
- `pool`: `primary` (write pool), `replica` (all read replicas, summed), `other`
- `state`: `total`, `idle`, `active`, `max`

Anything not in the list is collapsed to `other` by the metrics service, so a
coding mistake cannot leak an identifier into the output. Each metric is also
capped at 500 distinct label combinations as a second line of defence.

## Privacy rules for metric labels

These rules are enforced by code and by tests (`src/observability/*.spec.ts`).

1. **Never** use any of these as a label value (or as part of one):
   - user ids, anonymous user ids, session ids, request ids
   - confession ids, comment ids, message ids, report ids, tag names
   - search terms or any confession/comment/message text
   - emails, wallet addresses, tokens, API keys, cookies
   - IP addresses, user agents, referrers
   - raw URLs, raw paths, or query strings
2. **Never** put a value into a label unless it comes from a closed, documented
   list. If the number of possible values is not small and known in advance, it
   is not a label.
3. Route labels come from `categorizeRoute()`, which returns fixed constants and
   never echoes its input. `/api/confessions/<uuid>` and `/api/confessions/:id`
   are the same category.
4. Unknown or scanner traffic (`/wp-admin/...`) is recorded as
   `route_category="other"` and never by its URL.
5. Status is recorded as a **class** (`2xx`, `4xx`, ...), not the exact code plus
   detail, to keep cardinality low.
6. Metric emission must never change behaviour: recording is wrapped so a
   failure cannot break or delay a response, and feed errors are re-thrown
   unchanged.
7. If you need per-user or per-confession debugging, use the structured logs
   (which are redacted) - not metrics.

## Adding a new metric or label

1. Add the allowed values as a closed list in `metric-labels.ts`.
2. Declare the metric in `operational-metrics.service.ts` with `allowedLabels`.
3. Add tests proving hostile input (ids, emails, tokens, text) never appears in
   `renderPrometheus()` output.
4. Update the tables in this document.

## Reading the metrics

`GET /api/metrics` returns Prometheus text format and is restricted to
authenticated admins (`JwtAuthGuard` + `AdminGuard`).

Example queries (PromQL):

```promql
# Feed p95 latency over 5 minutes
histogram_quantile(0.95,
  sum by (le, feed_type) (rate(xconfess_feed_query_duration_seconds_bucket[5m])))

# 5xx error ratio for the public feed route
sum(rate(xconfess_http_requests_total{route_category="confessions_feed",status_class="5xx"}[5m]))
/
sum(rate(xconfess_http_requests_total{route_category="confessions_feed"}[5m]))
```

Notes:

- Metrics are kept in memory per process and reset on restart, which is normal
  for Prometheus counters. With several instances, scrape each one.
- Requests aborted by the client before a response finishes are not recorded.
