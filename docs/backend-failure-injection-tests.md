# Backend failure and concurrency regression tests

The suite for #2346, #2351, #2352 and #2355 runs against PostgreSQL 16 and
Redis 7 with `TZ=Africa/Lagos` to catch timestamp conversion bugs outside UTC.
CI runs it using the existing service containers. It uses synthetic
data, creates a unique PostgreSQL schema per suite, and deletes only its own
schemas and BullMQ queues. Never point test commands at production services.

From a checkout with Node 22 and npm 10:

```bash
npm ci
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=postgres \
DB_PASSWORD=postgres DB_NAME=xconfess_test \
REDIS_HOST=127.0.0.1 REDIS_PORT=6379 \
npm run test:reliability --workspace=xconfess-backend
```

The database must already exist. The test user needs permission to create
schemas. Both integration flags are enabled by this command; unavailable
services fail the suite. Ordinary `backend:test` skips external-service tests
unless `PG_INTEGRATION=true` / `REDIS_INTEGRATION=true` or CI service settings
are present. The invalid-filter property test always runs.

## Redis dependency policy (#2346)

| Feature | Redis outage behavior |
| --- | --- |
| Optional confession/feed/analytics cache (`CacheService`) | Read becomes a cache miss; the caller uses PostgreSQL. Cache writes and invalidation are best effort. |
| Login lockout (`CACHE_MANAGER`) | Reject with HTTP 503; never replace shared security state with a process-local cache. |
| Session revocation operations | Reject with HTTP 503; a failed check cannot validate a revoked session. |
| Notification queues and delivery locks | Require Redis; failed enqueue operations propagate for retry. No local delivery fallback. |

The cache module uses the existing ioredis dependency directly because
cache-manager v7 ignores the old `store` option and suppresses store read errors.
The shared cache client has 1,000 ms connection and command deadlines, no offline
command queue, and no automatic replay of unanswered commands. Reconnection
runs in the background; security operations fail until the shared store returns.
Errors expose fixed messages without cache keys, credentials or provider text.
Cached application values use a dedicated `xconfess:cache:` prefix; cache clear
and pattern invalidation never flush other Redis namespaces.

The low-level shared cache uses millisecond TTLs. `CacheService` keeps its public
TTL argument in seconds and converts it; login lockout converts its durations
to milliseconds as well. The tests verify actual Redis TTLs and state shared
across independent clients. TCP proxies inject disconnects and stalled replies
without stopping the caller's Redis server.

## Reproducible feed properties (#2351)

fast-check runs 100 invalid query combinations and 60 valid database scenarios
with default seed `2351`. Valid cases vary gender, sort, page size, page number,
visibility, moderation and publication state, and reaction/comment counts.
Each case includes public rows to exercise tied timestamps and aggregate
scores; an independent model checks visibility and full cursor traversal.
Invalid cases go through Nest's production validation pipe.
Cursor timestamps bind as Date values so PostgreSQL uses the same timezone
conversion for pagination and insertion.

Failures print the seed and shrink path. Replay a failure with the reported
values, for example:

```bash
FC_SEED=2351 FC_PATH='reported:path' \
PG_INTEGRATION=true npm test --workspace=xconfess-backend -- \
  --runTestsByPath src/confession/feed-filter.property.pg.spec.ts \
  --testNamePattern='matches an independent'
```

Pass the same database settings as the full suite. Omit `FC_PATH` to explore all
cases with a different `FC_SEED`.

## Concurrent message sends (#2352)

`POST /api/messages` accepts an optional `Idempotency-Key` header (1–128
characters, with at least one non-whitespace character). The server stores only
a SHA-256 digest scoped to the authenticated user. Reusing a key with the same
confession and exact ciphertext returns the committed message; a different
payload returns HTTP 409. A key remains reserved while its message exists.
Requests without a key each create a message. Clients must retry the same
ciphertext envelope rather than encrypting it again under the same key.

Apply `npm run backend:migration:run` before deploying this change. The nullable
column and unique index preserve existing messages. Transaction-scoped PostgreSQL
advisory locks serialize retries of one key. Message and notification outbox
inserts commit together. Tests submit 20 parallel sends with shared, distinct
and missing keys, inject an outbox insert failure, and verify stable history
pagination when timestamps tie. Idempotency keys from different users remain
independent; conflicting replays create no additional records.
New sends persist millisecond timestamps to match the cursor precision, and
cursor predicates keep both branches inside the authorized thread filter.

## Notification failures (#2355)

The real BullMQ worker exercises provider timeouts and persistent rejections.
The retry budget stays at the production five attempts; tests shorten only the
backoff delay. Production SMTP connections and greetings time out after five
seconds; sockets time out after ten seconds. Provider failures remain retryable,
and exhausted jobs create one deterministic dead letter.

If notification persistence succeeds and enqueueing fails, replay retries the
email enqueue using the saved notification and stable job ID. Database source
keys and delivery markers prevent duplicate rows and deliveries in the tested
failure scenarios. Tests also cover parallel replays and verify error metadata
contains only allowlisted failure codes. Original replay payloads remain behind
the existing DLQ admin guards.

SMTP has no transactional exactly-once guarantee: a provider can accept a send
before the worker loses its connection or delivery-marker write. Those ambiguous
outcomes require provider-side idempotency to eliminate duplicate email fully.
