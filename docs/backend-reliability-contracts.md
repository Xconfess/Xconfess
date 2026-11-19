# Backend request and notification reliability contracts

This note documents the request and background-job behavior used by the API.

## Request correlation and application logs

The API accepts an `x-request-id` only when it is 1–128 printable ASCII
characters from `A-Z`, `a-z`, digits, `.`, `_`, `:`, `/`, and `-`. Invalid or
missing values are replaced with a UUID. The accepted ID is attached to the
request and returned in the response header so it can correlate logs and
support reports.

HTTP request logs are structured JSON and include method, matched route
template, status, duration, request ID, user scope, subsystem, and timestamp.
They do not include request bodies, query strings, or exception messages. Use the route template
instead of a concrete resource ID when the framework has matched a route.
Log payloads pass through the shared redactor; never add passwords, bearer
tokens, confession text, private-message text, or secret keys as log fields.

## Rate-limited responses

Throttled requests return HTTP `429` using the normal API error fields:

```json
{
  "statusCode": 429,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please wait a moment and try again.",
  "retryAfter": 17,
  "requestId": "request-id",
  "timestamp": "2026-09-27T00:00:00.000Z",
  "path": "/api/confessions"
}
```

Clients should wait for `Retry-After` seconds before retrying. `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, and `X-RateLimit-Reset` describe the active throttler
window; the exception filter preserves values set by the guard. The `path` omits
the query string.

## Notification idempotency, retries, and dead letters

Notification rows derive a stable `sourceKey` from the source event when one is
available, with a database unique index preventing duplicate in-app rows. Email
jobs use that source key (or the persisted notification ID) as their event key
and a deterministic BullMQ job ID. The worker hashes the event key for Redis
storage, uses a short distributed lock while sending, and records delivery only
after the send succeeds. Failed sends release the lock so BullMQ can retry; a
second worker cannot concurrently deliver the same event. Delivered markers
remain for 30 days.

Notification jobs use five attempts with exponential backoff. After the final
failure the worker writes one stable-ID record to `notifications-dlq`, including
the original event payload required for replay and bounded, secret-redacted
failure metadata. The failed payload is available only through admin-guarded
DLQ routes. Operators can inspect, replay, or clean up jobs; replay count limits
prevent an unbounded manual retry cycle. Transient failures remain in the main
queue and are not moved to the DLQ early.
