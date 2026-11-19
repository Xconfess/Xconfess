# WebSocket Event Reference

> **Version**: 1.0.0
> **Status**: Draft
> **Scope**: Public realtime contracts served by the xConfess backend.

This document describes the Socket.IO namespaces, event names, and payload
shapes that the backend currently serves. It covers the two namespaces
intended for public consumption (`/notifications`, `/reactions`) and
explicitly excludes the internal `/admin` namespace.

**Verified against**: `xconfess-backend/src/notifications/gateways/notification.gateway.ts`,
`xconfess-backend/src/reaction/reactions.gateway.ts`,
`xconfess-backend/src/websocket/websocket.adapter.ts`.

## Connection

- **Path**: `/socket.io`.
- **Transports**: `websocket` preferred, `polling` fallback.
- **Authentication**: JWT via `handshake.auth.token` OR `Authorization: Bearer <token>`.
  Both `/notifications` and `/reactions` require a valid token.
- **Origin**: CORS is set from `FRONTEND_URL` in `WebSocketAdapter`, not `origin: '*'`.
- **Reconnect**: jittered backoff, Socket.IO defaults.

## Notifications namespace (`/notifications`)

Authenticated. Every socket is joined to `user:<authenticatedUserId>` on connect.
All server-to-client events are scoped to that room.

### Client to server

| Event | Payload |
| --- | --- |
| `subscribe:user-notifications` | `{ userId?: string }` |
| `join-notifications` | `userId?: string` (legacy alias) |
| `unsubscribe:user-notifications` | _(none)_ |
| `mark-read` | `{ notificationId: string }` |
| `mark-all-read` | _(none)_ |
| `get-unread-count` | _(none)_ |

### Server to client

| Event | Payload |
| --- | --- |
| `subscription:confirmed` | `{ channel: string, timestamp: string }` |
| `subscription:rejected` | `{ channel: string, reason: string, timestamp: string }` |
| `subscription:cancelled` | `{ channel: string, timestamp: string }` |
| `notifications:sync` | `{ notifications: Notification[], unreadCount: number, timestamp: string }` |
| `notifications:sync-failed` | `{ message: string, timestamp: string }` |
| `notification-read` | `{ notificationId: string }` |
| `all-notifications-read` | `{}` |
| `unread-count` | `{ count: number }` |
| `new-notification` | `Notification` |
| `error` | `{ message: string }` |

Example payloads:

    { channel: user:42, timestamp: 2026-10-02T10:15:30.000Z }
    { count: 3 }
    { notifications: [ { id: n_1, type: new_message, read: false } ], unreadCount: 1 }

The `Notification` shape is defined in
`xconfess-backend/src/notifications/entities/notification.entity.ts`.
`NotificationType.NEW_MESSAGE` is an in-app notification category, not a
realtime message event - see the Messages section below.

## Reactions namespace (`/reactions`)

Public read fanout, but each socket must still authenticate. Per-IP
connections are capped at 50, and subscription churn is rate-limited
(30 requests / 60s).

### Client to server

| Event | Payload |
| --- | --- |
| `subscribe:confession` | `{ confessionId: string }` |
| `unsubscribe:confession` | `{ confessionId: string }` |

### Server to client

| Event | Payload |
| --- | --- |
| `connected` | `{ message: string, socketId: string }` |
| `subscribed` | `{ confessionId: string, message: string }` |
| `unsubscribed` | `{ confessionId: string, message: string }` |
| `reaction:added` | `ReactionPayload` |
| `reaction:removed` | `ReactionPayload` |
| `confession:updated` | `ConfessionUpdatedPayload` |
| `auth_error` | `{ reason: string, correlationId: string, timestamp: string }` |
| `error` | `{ message: string, retryAfter?: number }` |

Example payloads:

    { message: Successfully
## Messages - no realtime channel

**There are no message WebSocket events.** Message delivery in xConfess uses
the REST endpoints in `xconfess-backend/src/messages/messages.controller.ts`.
There is no `/messages` gateway on the backend.

The frontend ships a Socket.IO client that expects a `/messages` namespace
with these events (`xconfess-frontend/app/lib/hooks/useMessagesWebSocket.ts`
and `useReadReceipts.ts`):

- `new_message` (S to C)
- `new_reply` (S to C)
- `message_read` (S to C)
- `thread_updated` (S to C)
- `read:receipt` (S to C)
- `subscribe:thread` (C to S)
- `unsubscribe:thread` (C to S)

These are client-side expectations only. No backend gateway emits or handles
them at this commit, so they are not part of the public contract. Do not
integrate against them until a `/messages` gateway lands and this document
is updated.

## Out of scope - internal-only events

The following namespace is not a public contract. It is served by the
in-repo admin dashboard only. Payloads may change without notice and
external clients must not subscribe to it.

### `/admin`

- Client to server: `subscribe:admin-events`, `unsubscribe:admin-events`
- Server to client: `subscription:confirmed`, `subscription:cancelled`,
  `new-report`, `report-updated`, `reports-bulk-updated`

The namespace authenticates with the same JWT scheme as `/notifications`,
requires `UserRole.ADMIN`, and rejects non-admins in `handleConnection`.

## Versioning and change policy

- Event names are treated as stable identifiers. Renaming a public event is
  a breaking change.
- Payload field additions are backwards-compatible. Consumers must ignore
  unknown fields.
- Payload field removals or type changes are breaking changes.
- The `error` and `auth_error` events are stable; their `message` and
  `reason` strings are human-readable and may change wording. Clients should
  key on the event name, not the string content.

## See also

- [WebSocket Threat Model](./websocket-threat-model.md) - auth model, CORS
  policy, per-IP caps, auth failure telemetry.
- [API Integration](./API_INTEGRATION.md) - REST contract for messages and
  the rest of the HTTP surface.
- [Event Schemas](./event-schemas.md) - on-chain Soroban event naming and
  payload conventions. Distinct from the Socket.IO events above.
