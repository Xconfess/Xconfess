# API Integration Guide

This guide helps third-party developers integrate with the xConfess HTTP API.
It covers authentication, public endpoints, rate limits, error handling, webhook delivery, and copy-paste examples in `curl`, JavaScript, and Python.

## Base URL

All endpoints are served under the server base URL plus the global API prefix:

- `https://<your-host>/api`

For local development, the backend runs at `http://localhost:5000/api` by default.

## Authentication Overview

xConfess uses stateless JWT authentication for protected routes.
Third-party integrations should authenticate by exchanging email/password credentials for an access token.
For the meanings of `anonymousUserId`, session context, and wallet-derived
identity references, see the [identity terminology in the glossary](GLOSSARY.md#anonymous-identity-terminology).

### Supported auth endpoints

- `POST /api/users/register` — create a new account
- `POST /api/users/login` — login with email/password
- `POST /api/auth/login` — alternative login endpoint (same payload)
- `GET /api/auth/me` — get profile for current JWT user
- `GET /api/auth/session` — get authenticated session information
- `POST /api/auth/logout` — acknowledge logout
- `POST /api/auth/forgot-password` — request password reset
- `POST /api/auth/reset-password` — complete password reset

### Login request

`POST /api/auth/login`

Request body:

```json
{
  "email": "alice@example.com",
  "password": "Str0ng!Pass#1"
}
```

Successful response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "anonymousUserId": "7f3a2b1c-2c11-4f06-a5d8-faf2917fd5d9",
  "user": {
    "id": 1,
    "username": "alice_42",
    "role": "user",
    "is_active": true
  }
}
```

> Tip: `POST /api/users/login` is equivalent for login flows and can be used interchangeably.

### Use the JWT

Include the token on protected requests:

```http
Authorization: Bearer <access_token>
```

### Profile endpoints

- `GET /api/auth/me`
- `GET /api/auth/session`
- `GET /api/users/profile`

These return the current authenticated user profile. Use whichever route best fits your integration.

## Public endpoint reference

### Create confession

`POST /api/confessions`

Request body:

```json
{
  "message": "I finally took a break and it helped.",
  "gender": "other",
  "tags": ["wellbeing", "work"],
  "stellarTxHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

Response example:

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "message": "I finally took a break and it helped.",
  "gender": "other",
  "tags": ["wellbeing", "work"],
  "view_count": 0,
  "created_at": "2026-04-25T10:00:00.000Z"
}
```

### List confessions

`GET /api/confessions`

Query parameters:

- `page` (optional)
- `limit` (optional)

Response shape:

```json
{
  "data": [ /* confession objects */ ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

### Search confessions

`GET /api/confessions/search`

Search parameters are validated and allow hybrid query behavior.

### Full-text search

`GET /api/confessions/search/fulltext`

Same query shape as `/confessions/search` but performs a full-text search over confession content.

### Trending confessions

`GET /api/confessions/trending/top`

Returns the current top trending confessions.

### Tags

- `GET /api/confessions/tags` — list all available tags
- `GET /api/confessions/tags/:tag` — list confessions for a tag

### Confession details and updates

- `PUT /api/confessions/:id` — update an existing confession
- `DELETE /api/confessions/:id` — soft-delete a confession
- `PATCH /api/confessions/:id/restore` — restore a soft-deleted confession

### Stellar anchoring

- `POST /api/confessions/:id/anchor` — anchor a confession on Stellar
- `GET /api/confessions/:id/stellar/verify` — verify a confession anchor

### Reactions

`POST /api/reactions`

Request body:

```json
{
  "confessionId": "4f8f8eb0-b6d8-4a92-8f77-6fa3c7aa2e67",
  "anonymousUserId": "2c11e9ce-4f2f-4f06-a5d8-faf2917fd5d9",
  "emoji": "🔥"
}
```

### Messages

- `POST /api/messages` — send an anonymous message to a confession author
- `POST /api/messages/reply` — reply to an anonymous message as the confession author
- `GET /api/messages/threads` — list message threads for authenticated user
- `GET /api/messages` — list messages in a conversation thread

`POST /api/messages` body:

```json
{
  "confession_id": "4f8f8eb0-b6d8-4a92-8f77-6fa3c7aa2e67",
  "content": "Thanks for sharing this."
}
```

### Reports

`POST /api/reports`

Request body:

```json
{
  "confessionId": "4f8f8eb0-b6d8-4a92-8f77-6fa3c7aa2e67",
  "type": "spam",
  "reason": "Repeated promotional content"
}
```

### Tipping

- `GET /api/confessions/:id/tips` — list tips for a confession
- `GET /api/confessions/:id/tips/stats` — tip aggregate stats
- `POST /api/confessions/:id/tips/verify` — verify an XLM tip transaction

`POST /api/confessions/:id/tips/verify` body:

```json
{
  "txId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

#### Response states

Every response carries a typed `state` field. Consumers should switch on
`state` rather than parsing the `message` text, since message wording may
change across releases. `verified` and `duplicate` are success outcomes
(2xx); everything else is a typed error.

| `state`     | HTTP status | Meaning | `canRetry` |
|-------------|-------------|---------|------------|
| `verified`  | 201 | This request performed first-writer settlement. | — |
| `duplicate` | 201 | A prior request already settled this exact `(confessionId, txId)` pair. This is a safe, canonical replay — not an error. | — |
| `pending`   | 409 | Another request is actively settling this pair right now. | `true` |
| `stale`     | 409 | Verification exceeded the SLA threshold and is under reconciliation review. This is not a terminal failure. | `true` |
| `conflict`  | 409 | The transaction ID is already bound to a *different* confession, or reconciliation flagged a genuine conflict. | `false` |
| `failed`    | 400 | Verification failed terminally (invalid amount, transaction not found or invalid on-chain) — or a transient/retryable error such as a Horizon network failure. | `true` for transient errors, `false` for terminal ones |

Malformed transaction IDs (not a 64-character hex string) are rejected by
request validation before reaching this logic, returning a standard
`400 Bad Request` with a `message` array — they do not carry a `state`
field, since they never reach the verification pipeline.

Success response body (`verified` or `duplicate`):

```json
{
  "state": "verified",
  "success": true,
  "isNew": true,
  "isIdempotent": false,
  "tip": {
    "id": "tip-abc-123",
    "confessionId": "4f8f8eb0-b6d8-4a92-8f77-6fa3c7aa2e67",
    "amount": 100,
    "txId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "senderAddress": null,
    "status": "verified",
    "verifiedAt": "2026-04-25T10:00:00.000Z",
    "createdAt": "2026-04-25T10:00:00.000Z"
  }
}
```

The `tip` object in this response is intentionally a reduced, public-safe
view. Internal-only fields (`idempotencyKey`, `processingLock`, `lockedAt`,
`lockedBy`, `retryCount`, `lastChainStatus`, `lastCheckedAt`,
`reconciliationMetadata`) are never included on the wire.

Typed error response body (`pending` / `stale` / `conflict` / `failed`):

```json
{
  "message": "Transaction aaaa...aaaa verification has exceeded the expected processing time and is under review. It has not failed — check back shortly or contact support with this reference.",
  "state": "stale",
  "conflictReason": "ALREADY_PROCESSING",
  "canRetry": true
}
```

### Health checks

- `GET /api/health/live`
- `GET /api/health/ready`

These endpoints are useful for monitoring and verifying backend availability.

## Rate limiting

xConfess enforces request throttling both globally and on sensitive endpoints.

### Default API rate limits

- `GET` requests: 50 requests per 60 seconds per client IP
- `POST`, `PUT`, `PATCH`, `DELETE` requests: 5 requests per 60 seconds per client IP

### Route-specific limits

- `POST /api/auth/login` and `POST /api/users/login`: 5 requests / 60 seconds
- `POST /api/users/register`: 3 requests / 60 seconds
- `POST /api/auth/forgot-password`: 3 requests / 300 seconds
- `POST /api/confessions/:id/report`: 5 requests / 300 seconds
- `POST /api/confessions/:id/tips/verify`: strict throttling enforced by the backend because it calls Stellar Horizon

### Rate-limit response

When a client is throttled, the API returns HTTP `429 Too Many Requests` with a JSON body similar to:

```json
{
  "statusCode": 429,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please wait a moment and try again.",
  "retryAfter": 12,
  "timestamp": "2026-04-25T10:00:00.000Z",
  "path": "/api/confessions",
  "requestId": "..."
}
```

The response also includes a `Retry-After` response header.

> Note: `POST /api/confessions/:id/tips/verify` may also include a stricter retry header such as `Retry-After-strict`.

## Error codes

xConfess uses consistent error codes in every non-2xx response.
Common values include:

- `AUTH_UNAUTHORIZED` — request was not authenticated
- `AUTH_FORBIDDEN` — insufficient permissions
- `AUTH_INVALID_CREDENTIALS` — login failed
- `AUTH_SESSION_EXPIRED` — JWT has expired
- `AUTH_TOKEN_INVALID` — JWT is malformed or invalid
- `BAD_REQUEST` — malformed request or missing parameters
- `VALIDATION_FAILED` — schema validation failed
- `MISSING_PARAMETER` / `INVALID_PARAMETER` — query or body input issues
- `NOT_FOUND` — requested resource not found
- `CONFLICT` — duplicate resource state
- `RATE_LIMIT_EXCEEDED` — rate limit exceeded
- `STELLAR_ERROR` — Stellar/Soroban integration failure
- `INTERNAL_SERVER_ERROR` — unexpected server problem

### Error response examples

Ordinary Nest HTTP errors are formatted with `status`, `code`, `message`,
`timestamp`, `path`, and `requestId`; `details` appears when supplied. Validation
errors may put an array in `message`. The unexpected-error and throttling
handlers use `statusCode` instead of `status`. The timestamps and request IDs
below are representative values.

Invalid request body (`400 Bad Request`):

```json
{
  "status": 400,
  "code": "BAD_REQUEST",
  "message": ["message must be a string"],
  "timestamp": "2026-10-17T10:00:00.000Z",
  "path": "/api/confessions",
  "requestId": "req-6f57b4d2"
}
```

Missing or expired authentication (`401 Unauthorized`):

```json
{
  "status": 401,
  "code": "AUTH_SESSION_EXPIRED",
  "message": "Authentication token has expired",
  "timestamp": "2026-10-17T10:00:00.000Z",
  "path": "/api/auth/me",
  "requestId": "req-6f57b4d2"
}
```

Insufficient role (`403 Forbidden`):

```json
{
  "status": 403,
  "code": "AUTH_FORBIDDEN",
  "message": "Only admins can access this endpoint",
  "timestamp": "2026-10-17T10:00:00.000Z",
  "path": "/api/admin/reports",
  "requestId": "req-6f57b4d2"
}
```

Missing resource (`404 Not Found`):

```json
{
  "status": 404,
  "code": "NOT_FOUND",
  "message": "Report not found",
  "timestamp": "2026-10-17T10:00:00.000Z",
  "path": "/api/admin/reports/00000000-0000-4000-8000-000000000000",
  "requestId": "req-6f57b4d2"
}
```

An unexpected server error is returned as a generic message with
`statusCode: 500`; the response does not contain an exception stack or internal
error message:

```json
{
  "statusCode": 500,
  "code": "INTERNAL_SERVER_ERROR",
  "message": "An unexpected error occurred",
  "timestamp": "2026-10-17T10:00:00.000Z",
  "path": "/api/confessions",
  "requestId": "req-6f57b4d2"
}
```

Use `code` for deterministic handling and `message` for display.
For common HTTP statuses, `400` means invalid input, `401` means authentication
is missing or invalid, `403` means the caller lacks permission, `404` means the
resource was not found, `409` means the request conflicts with current state,
`429` means the caller exceeded a rate limit, and `500` means an unexpected
server error. A `429` response also includes `retryAfter` and the `Retry-After`
header.

## Webhooks

xConfess supports moderation webhooks at:

- `POST /api/webhooks/moderation/results`

This endpoint is not authenticated via JWT. Instead it requires HMAC signature validation using the configured `WEBHOOK_SECRET`.

### Payload format

```json
{
  "confessionId": "conf-123",
  "moderationScore": 0.71,
  "moderationFlags": ["harassment"],
  "moderationStatus": "FLAGGED",
  "details": { "harassment": 0.71 },
  "timestamp": "2026-04-25T10:00:00.000Z"
}
```

### Signature header

The webhook sender must sign the raw JSON payload with HMAC SHA256 using `WEBHOOK_SECRET` and include:

```http
x-webhook-signature: <hex-encoded-hmac-sha256>
```

### Delivery rules

- The `timestamp` must be present and parse as a valid ISO-8601 value.
- The payload must be received within 300 seconds of the timestamp.
- Duplicate deliveries are treated as idempotent and ignored safely.

### Success response

```json
{
  "success": true,
  "confessionId": "conf-123",
  "status": "FLAGGED",
  "isIdempotent": false
}
```

## Example integration flow

### 1. Authenticate

```bash
curl -X POST "http://localhost:5000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Str0ng!Pass#1"}'
```

### 2. Create a confession

```bash
curl -X POST "http://localhost:5000/api/confessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"I finally took a break and it helped.","gender":"other","tags":["wellbeing","work"]}'
```

### 3. Fetch trending confessions

```bash
curl "http://localhost:5000/api/confessions/trending/top"
```

### 4. Report a confession

```bash
curl -X POST "http://localhost:5000/api/reports" \
  -H "Content-Type: application/json" \
  -d '{"confessionId":"4f8f8eb0-b6d8-4a92-8f77-6fa3c7aa2e67","type":"spam","reason":"Promotional content"}'
```

## Copy-paste examples

### JavaScript

```js
async function login(email, password) {
  const res = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  return res.json();
}

async function createConfession(token, confession) {
  const res = await fetch('http://localhost:5000/api/confessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(confession),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Confession creation failed');
  }
  return res.json();
}
```

### Python

```python
import requests

base_url = 'http://localhost:5000/api'

login_resp = requests.post(
    f'{base_url}/auth/login',
    json={'email': 'alice@example.com', 'password': 'Str0ng!Pass#1'},
)
login_resp.raise_for_status()
access_token = login_resp.json()['access_token']

confession_resp = requests.post(
    f'{base_url}/confessions',
    headers={'Authorization': f'Bearer {access_token}'},
    json={
        'message': 'I finally took a break and it helped.',
        'gender': 'other',
        'tags': ['wellbeing', 'work'],
    },
)
confession_resp.raise_for_status()
print(confession_resp.json())
```

### `curl`

```bash
curl -X POST "http://localhost:5000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Str0ng!Pass#1"}'

curl -X POST "http://localhost:5000/api/confessions" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"message":"I finally took a break and it helped.","gender":"other","tags":["wellbeing","work"]}'
```

## Notes

- The API is documented in Swagger when running locally at `/api/api-docs`.
- OAuth2 is not currently supported for third-party integrations.
- SDK generation is not part of this guide. Use the documented HTTP endpoints directly.

## Troubleshooting

- `401 AUTH_UNAUTHORIZED`, `AUTH_TOKEN_INVALID`, or `AUTH_SESSION_EXPIRED` means the JWT is missing, invalid, or expired, respectively.
- `429 RATE_LIMIT_EXCEEDED` means you exceeded the configured rate limit; retry after the header value.
- `400 BAD_REQUEST` or `VALIDATION_FAILED` means request payload shape or field values are invalid.
- `404 NOT_FOUND` means the resource ID was not found or the route is incorrect.
- `500 INTERNAL_SERVER_ERROR` means an unexpected backend failure.
