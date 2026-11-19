# API contract hardening (issues #2330–#2333)

This document records the HTTP contracts verified by the backend contract test
suite (`npm run backend:test:contracts`).

## Identity login and logout (#2330)

`POST /api/auth/login` and `POST /api/auth/2fa/login` return exactly these top-level
fields:

| Field | Type | Notes |
| --- | --- | --- |
| `access_token` | string | JWT used as `Authorization: Bearer <token>`. |
| `anonymousUserId` | string | Stable anonymous identity for the authenticated session. |
| `user` | object | Public user profile. Never includes a password hash, TOTP secret, or recovery codes. |

Error cases:

- Missing credentials → `400 BAD_REQUEST`.
- Invalid credentials → `401 AUTH_INVALID_CREDENTIALS`.
- Expired token → `401 AUTH_SESSION_EXPIRED`.
- Malformed token → `401 AUTH_TOKEN_INVALID`.
- Revoked session → `401 AUTH_SESSION_REVOKED`.

`POST /api/auth/logout` requires a valid bearer token and revokes the current
user's JWT sessions immediately. Any JWT whose `iat` predates the revocation is
rejected with `401 AUTH_SESSION_REVOKED`. Clients must discard the token after a
successful logout.

## Duplicate operations and conflicts (#2331)

Safe retries remain idempotent:

- Duplicate reaction with the same payload returns the original `201` response.
- Duplicate tip verification returns `201` with `state: "duplicate"`.
- Duplicate confession submission with the same key and payload returns the
  original `201` response.

Genuine state conflicts return `409` with a consistent envelope:

```json
{
  "schemaVersion": 1,
  "status": 409,
  "code": "CONFLICT",
  "message": "The tip operation conflicts with the current state",
  "details": {
    "operation": "tip",
    "reason": "ALREADY_PROCESSING",
    "canRetry": true,
    "state": "pending"
  },
  "conflictReason": "ALREADY_PROCESSING",
  "canRetry": true,
  "retryAfter": 2
}
```

Supported `operation` values include `reaction`, `tip`, and
`confession_submission`. `details.canRetry` tells clients whether an unmodified
retry may succeed. `details.retryWith` explains what to change when a retry with
the same input cannot succeed. Validation failures remain `400` and never use the
conflict envelope.

## Sort key allowlists (#2332)

Sort keys are explicit. Unknown values are rejected at HTTP boundaries with
`400 VALIDATION_FAILED` and an `allowedValues` list; service-layer callers fall
back to a safe default.

| Surface | Allowed values | Default |
| --- | --- | --- |
| `GET /api/admin/audit-logs?sortBy=` | `createdAt`, `actor`, `action`, `target` | `createdAt` |
| `GET /api/admin/reports?sortBy=` | `id`, `createdAt`, `status`, `reason` | `createdAt` |
| Search deterministic ordering | `relevance`, `createdAt`, `trending` | `relevance` |
| `sortOrder` on the surfaces above | `ASC`, `DESC` | `DESC` |

Values are mapped to fixed SQL fragments; request text is never interpolated
into an `ORDER BY` clause. Injection-like values such as
`createdAt; DROP TABLE users`, `status) OR 1=1 --`, and
`ASC; DELETE FROM audit_log` are rejected or normalized to the default.

## Notification response schemas (#2333)

Notification endpoints return a reduced, public-safe projection:

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "type": "new_message",
  "title": "New message",
  "message": "Someone sent you a message",
  "isRead": false,
  "readAt": null,
  "createdAt": "2026-11-19T10:00:00.000Z",
  "updatedAt": "2026-11-19T10:00:00.000Z",
  "metadata": {
    "messageId": "message-1",
    "confessionId": "confession-1"
  }
}
```

Endpoints covered:

- `GET /api/notifications` → `{ notifications, total, unreadCount }`.
- `GET /api/notifications/:id` → one notification object, `404` when it is not
  owned by the caller.
- `PATCH /api/notifications/:id/read` → updated notification object.
- `GET /api/notifications/unread-count` → `{ unreadCount }`.

The following fields are never returned: `userId`, `user`, `sourceKey`,
`isEmailSent`, `emailSentAt`, and the metadata keys `senderId`,
`senderAnonymousId`, and `sourceEventId`.

## Running the contracts

```bash
npm run backend:test:contracts
```

CI runs the same command as the `API contract hardening tests` step in the
`apps` job before the reliability suite.
