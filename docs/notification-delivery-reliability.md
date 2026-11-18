# Notification Delivery Reliability

Issue #1695 defines notification delivery as an observable state machine rather
than a best-effort side effect.

## Delivery States

```mermaid
stateDiagram-v2
  [*] --> created: notification row saved
  created --> skipped: user preference, quiet hours, or jobs disabled
  created --> queued: BullMQ job accepted
  queued --> sent: worker delivered email/push
  queued --> retried: transient worker failure
  retried --> sent: retry succeeds
  retried --> dead_lettered: attempts exhausted
  queued --> failed: terminal worker failure
```

State meanings:

- `created`: the in-app notification exists and can be synced after reconnect.
- `queued`: Redis/BullMQ accepted async delivery.
- `sent`: the worker completed delivery.
- `skipped`: delivery was intentionally not enqueued, for example
  `ENABLE_BACKGROUND_JOBS=false` or channel preferences disabled.
- `failed`: processing failed and may be retried.
- `retried`: BullMQ scheduled another attempt.
- `dead-lettered`: attempts are exhausted and the DLQ admin endpoint can inspect
  or replay the job.

## Disabled Background Jobs

When `ENABLE_BACKGROUND_JOBS` is anything other than `"true"`, Redis-backed
delivery is disabled by design. The app still creates in-app notifications, logs
explicit skipped delivery, increments `notification_delivery_skipped_total`, and
marks outbox dispatches `SKIPPED` instead of pretending they were delivered.

Sample readiness excerpt:

```json
{
  "backgroundJobMode": "disabled",
  "subsystems": [
    { "name": "redis", "status": "disabled" },
    { "name": "queues", "status": "disabled" }
  ]
}
```

## Idempotency

Notification rows use a nullable `sourceKey` generated from
`userId:type:sourceId`, where `sourceId` comes from `sourceEventId`,
`messageId`, `commentId`, or `reactionId`. The database has a partial unique
index on non-null source keys, and the service returns the existing notification
when a duplicate source event is replayed.

## Reconnect Sync

The notification gateway joins authenticated clients to `user:<id>` only. On
connect and subscription confirmation it emits `notifications:sync` with the
latest unread notifications and unread count, so a websocket reconnect does not
depend on replaying every missed socket event.

## Redis outage and recovery

When Redis is temporarily unavailable, BullMQ-backed delivery is unavailable too.
The API must not report an email as delivered: the job remains retryable and the
readiness endpoint reports the Redis/queue dependency as down. After Redis
reconnects, BullMQ retries the same job. The stable `idempotencyKey`, delivery
marker, and five-minute processing lock ensure that a recovered job is delivered
once even if more than one worker observes it.

Run the outage regression tests locally without real credentials or an external
Redis instance:

```bash
npm test --workspace=xconfess-backend -- \
  src/notifications/processors/notification.processor.spec.ts
```

The tests simulate a connection failure before processing and a disconnect during
a failed delivery, then restore the mock Redis connection and verify successful
retry plus duplicate suppression. In a live environment, use
`GET /api/health/ready` to confirm recovery; never paste `REDIS_URL` or its
password into test output or issue comments.

## Diagnostics

Failed async jobs are visible through the existing admin DLQ endpoints:

- `GET /admin/notifications/dlq`
- `POST /admin/notifications/dlq/:jobId/replay`

Outbox rows now distinguish `PENDING`, `PROCESSING`, `COMPLETED`, `SKIPPED`,
and `FAILED`.
