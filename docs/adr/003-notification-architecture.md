# ADR-003: Notification Architecture — BullMQ + WebSocket

## Status

Accepted

## Context

Users receive real-time notifications when someone reacts to or comments on their confession. Notifications must be delivered with low latency, survive temporary disconnections, and not block the request that triggered them (e.g. posting a reaction should return instantly, not wait for notification delivery).

## Options Considered

- **Option A — Synchronous in-request delivery**: Send notifications inline during the HTTP request. Simple but blocks the response and fails silently if the notification service is slow.
- **Option B — BullMQ job queue + WebSocket push**: Enqueue notification jobs in Redis via BullMQ. A worker processes the queue and pushes events to connected clients via Socket.IO WebSockets.
- **Option C — Server-Sent Events (SSE)**: Unidirectional push from server to browser. Simpler than WebSockets but no bidirectional support for future features.

## Decision

We chose **Option B** — BullMQ for async job processing with Socket.IO WebSockets for real-time delivery.

BullMQ decouples notification delivery from the HTTP request lifecycle. Jobs are retried automatically on failure (up to 3 attempts with exponential backoff). Socket.IO handles WebSocket connections with automatic fallback and room-based fan-out.

## Consequences

### Positive

- HTTP requests return immediately — notification delivery is non-blocking
- Failed jobs are retried automatically with backoff
- WebSockets support future bidirectional features (live reactions, typing indicators)

### Negative

- Redis is a required infrastructure dependency
- WebSocket connections add memory overhead per connected client
- Local development requires Redis running (or ENABLE_BACKGROUND_JOBS=false to skip)

## References

- xconfess-backend/src/notifications/
- xconfess-backend/src/app.module.ts (BullModule.forRootAsync)
- xconfess-backend/src/websocket/
