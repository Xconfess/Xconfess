# xConfess Backend API Documentation (Source-of-Truth)

This document is aligned with active controller decorators in `xconfess-backend/src`.

## Base URL

All HTTP routes are served under the global prefix:

- `/api`

Example: `POST /auth/login` in code is reachable at `POST /api/auth/login`.

## Authentication and Authorization

### Auth split: `/users/*` vs `/auth/*`

Both sets are active and should be treated as intentionally separate:

- `POST /api/users/register`: account creation (preferred registration route)
- `POST /api/users/login`: user login route used by user flows
- `POST /api/auth/login`: auth login route (also active)
- `GET /api/users/profile` and `GET /api/auth/me`: both provide authenticated profile-style lookups
- `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`: password reset flow lives under `/auth/*`

### Guards used by the backend

- `JwtAuthGuard`: requires `Authorization: Bearer <token>`
- `AdminGuard`: requires authenticated user with `role=admin`
- `OptionalJwtAuthGuard`: accepts anonymous requests; uses JWT when provided

### Header example

```http
Authorization: Bearer <jwt>
```

## DTO-accurate request examples

All examples below use field names and constraints from current DTOs.

### 1) Register (`POST /api/users/register`)

```json
{
  "email": "person@example.com",
  "password": "strongpass123",
  "username": "anon_writer"
}
```

### 2) Login (`POST /api/users/login` or `POST /api/auth/login`)

```json
{
  "email": "person@example.com",
  "password": "strongpass123"
}
```

### 3) Forgot password (`POST /api/auth/forgot-password`)

Provide at least one of `email` or `userId`:

```json
{
  "email": "person@example.com"
}
```

or

```json
{
  "userId": 42
}
```

### 4) Reset password (`POST /api/auth/reset-password`)

```json
{
  "token": "reset_token_here",
  "newPassword": "newstrongpass123"
}
```

### 5) Create confession (`POST /api/confessions`)

```json
{
  "message": "I finally took a break and it helped.",
  "gender": "other",
  "tags": ["wellbeing", "work"],
  "stellarTxHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

### 6) Update confession (`PUT /api/confessions/:id`)

```json
{
  "message": "Updated confession message"
}
```

### 7) Anchor confession (`POST /api/confessions/:id/anchor`)

```json
{
  "stellarTxHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "stellarHash": "optional_hash"
}
```

### 8) Add reaction (`POST /api/reactions`)

```json
{
  "confessionId": "4f8f8eb0-b6d8-4a92-8f77-6fa3c7aa2e67",
  "anonymousUserId": "2c11e9ce-4f2f-4f06-a5d8-faf2917fd5d9",
  "emoji": "🔥"
}
```

### 9) Send message (`POST /api/messages`)

```json
{
  "confession_id": "4f8f8eb0-b6d8-4a92-8f77-6fa3c7aa2e67",
  "content": "Thanks for sharing this."
}
```

### 10) Reply message (`POST /api/messages/reply`)

```json
{
  "message_id": 123,
  "reply": "Appreciate your kindness"
}
```

### 11) Report confession (`POST /api/confessions/:id/report`)

```json
{
  "type": "spam",
  "reason": "Repeated promotional content"
}
```

### 12) Verify tip (`POST /api/confessions/:id/tips/verify`)

```json
{
  "txId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

### 13) Admin resolve report (`PATCH /api/admin/reports/:id/resolve`)

```json
{
  "resolutionNotes": "Reviewed and action taken"
}
```

### 14) Admin bulk resolve (`PATCH /api/admin/reports/bulk-resolve`)

```json
{
  "reportIds": [
    "7ea244c7-7f0f-43a9-bae6-5a429f88d433",
    "f71a57a5-75d8-4fb2-80d0-963b08c33839"
  ],
  "notes": "Bulk moderation pass"
}
```

### 15) Notification preferences (`PUT /api/notifications/preferences`)

```json
{
  "enableInAppNotifications": true,
  "inAppNewMessage": true,
  "enableEmailNotifications": false,
  "batchWindowMinutes": 10,
  "batchThreshold": 3,
  "enableQuietHours": true,
  "quietHoursStart": "22:00",
  "quietHoursEnd": "07:00",
  "timezone": "Africa/Lagos"
}
```

## Health (`GET /api/health`)

Terminus health bundle used for operations and load balancers:

- **`app`**: process up.
- **`database`**: TypeORM ping to PostgreSQL.
- **`redis`**: Redis `PING`.
- **`schema`**: migration readiness for `anonymous_confessions` — required columns `search_vector`, `view_count` and indexes `idx_confession_search_vector`, `idx_confession_created_at`. If anything is missing or the check query fails, the **`schema`** indicator is **down** and the overall response is **HTTP 503** with details under `error.schema` / `info` per Terminus.

Startup also logs schema outcome once (Nest `MigrationVerificationService` on module init): **warn** when drift is detected, **error** when the verification query throws. There is no duplicate raw SQL in `main.ts`.

## Exact route inventory (active controllers)

The following list matches active `@Controller(...)` + method decorators.

| Method | Route |
|---|---|
| GET | `/api` |
| GET | `/api/health` |
| GET | `/api/diagnostics/notifications` |
| POST | `/api/auth/login` |
| GET | `/api/auth/me` |
| POST | `/api/auth/logout` |
| POST | `/api/auth/forgot-password` |
| POST | `/api/auth/reset-password` |
| POST | `/api/users/register` |
| POST | `/api/users/login` |
| GET | `/api/users/profile` |
| PUT | `/api/users/profile` |
| POST | `/api/users/deactivate` |
| POST | `/api/users/reactivate` |
| GET | `/api/users/notification-preferences` |
| PATCH | `/api/users/notification-preferences` |
| POST | `/api/confessions` |
| GET | `/api/confessions` |
| GET | `/api/confessions/search` |
| GET | `/api/confessions/search/fulltext` |
| GET | `/api/confessions/trending/top` |
| GET | `/api/confessions/tags` |
| GET | `/api/confessions/tags/:tag` |
| GET | `/api/confessions/deleted` |
| GET | `/api/confessions/:id/stellar/verify` |
| POST | `/api/confessions/:id/anchor` |
| PUT | `/api/confessions/:id` |
| DELETE | `/api/confessions/:id` |
| PATCH | `/api/confessions/:id/restore` |
| GET | `/api/confessions/:id` |
| POST | `/api/confessions/drafts` |
| GET | `/api/confessions/drafts` |
| GET | `/api/confessions/drafts/:id` |
| PATCH | `/api/confessions/drafts/:id` |
| DELETE | `/api/confessions/drafts/:id` |
| POST | `/api/confessions/drafts/:id/schedule` |
| POST | `/api/confessions/drafts/:id/cancel` |
| POST | `/api/confessions/drafts/:id/publish` |
| POST | `/api/confessions/drafts/:id/convert-to-draft` |
| POST | `/api/reactions` |
| POST | `/api/comments/:confessionId` |
| GET | `/api/comments/by-confession/:confessionId` |
| DELETE | `/api/comments/:id` |
| POST | `/api/comments/admin/comments/:id/approve` |
| POST | `/api/comments/admin/comments/:id/reject` |
| POST | `/api/messages` |
| POST | `/api/messages/reply` |
| GET | `/api/messages/threads` |
| GET | `/api/messages` |
| POST | `/api/confessions/:id/report` |
| GET | `/api/analytics/trending` |
| GET | `/api/analytics/reactions` |
| GET | `/api/analytics/users` |
| GET | `/api/analytics/stats` |
| GET | `/api/analytics/growth` |
| GET | `/api/admin/reports` |
| GET | `/api/admin/reports/:id` |
| PATCH | `/api/admin/reports/:id/resolve` |
| PATCH | `/api/admin/reports/:id/dismiss` |
| PATCH | `/api/admin/reports/bulk-resolve` |
| DELETE | `/api/admin/confessions/:id` |
| PATCH | `/api/admin/confessions/:id/hide` |
| PATCH | `/api/admin/confessions/:id/unhide` |
| GET | `/api/admin/users/search` |
| GET | `/api/admin/users/:id/history` |
| PATCH | `/api/admin/users/:id/ban` |
| PATCH | `/api/admin/users/:id/unban` |
| GET | `/api/admin/analytics` |
| GET | `/api/admin/audit-logs` |
| GET | `/api/admin/reports` (second controller also defines this) |
| PATCH | `/api/admin/reports/:id/resolve` (second controller also defines this) |
| GET | `/api/admin/moderation/pending` |
| POST | `/api/admin/moderation/review/:id` |
| GET | `/api/admin/moderation/stats` |
| GET | `/api/admin/moderation/accuracy` |
| GET | `/api/admin/moderation/config` |
| POST | `/api/admin/moderation/config/thresholds` |
| POST | `/api/admin/moderation/test` |
| GET | `/api/admin/moderation/confession/:confessionId` |
| GET | `/api/admin/moderation/user/:userId` |
| GET | `/api/admin/notifications/dlq` |
| POST | `/api/admin/notifications/dlq/:jobId/replay` |
| POST | `/api/admin/notifications/dlq/replay` |
| GET | `/api/admin/dlq` |
| GET | `/api/admin/dlq/:id` |
| POST | `/api/admin/dlq/:id/retry` |
| DELETE | `/api/admin/dlq/:id` |
| DELETE | `/api/admin/dlq` |
| GET | `/api/notifications` |
| GET | `/api/notifications/unread-count` |
| PATCH | `/api/notifications/:id/read` |
| PATCH | `/api/notifications/read-all` |
| GET | `/api/notifications/preferences` |
| PUT | `/api/notifications/preferences` |
| GET | `/api/websocket/health` |
| GET | `/api/websocket/stats` |
| POST | `/api/admin/email/preview` |
| POST | `/api/encryption/encrypt` |
| POST | `/api/encryption/decrypt` |
| GET | `/api/stellar/config` |
| GET | `/api/stellar/balance/:address` |
| POST | `/api/stellar/verify` |
| GET | `/api/stellar/account-exists/:address` |
| POST | `/api/stellar/invoke-contract` |
| GET | `/api/confessions/:id/tips` |
| GET | `/api/confessions/:id/tips/stats` |
| POST | `/api/confessions/:id/tips/verify` |
| GET | `/api/data-export/download/:id` |

## Removed legacy assumptions from older docs

Do not implement against these old route patterns:

- `/user` (singular) CRUD endpoints
- `/confession` (singular) endpoints
- `/reaction/confession/:confessionId`

Current backend uses pluralized routes and the exact inventory above.

## Notes for contributors

- Prefer `/api/users/*` for user lifecycle endpoints.
- `/api/auth/*` remains active for auth-centric operations and password-reset flow.
- Report submission endpoint supports anonymous and authenticated modes through optional JWT.
- Some admin/report routes are currently duplicated by two controllers; avoid assuming only one handler implementation exists.
