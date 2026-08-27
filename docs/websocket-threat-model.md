# Websocket Threat Model

## Entry Points

- `/notifications` is authenticated and private. Clients must provide a JWT in
  `handshake.auth.token`, an `Authorization: Bearer` header, or an accepted
  auth cookie. The gateway only joins `user:<authenticatedUserId>` rooms and
  rejects requested user rooms that do not match the authenticated socket owner.
- `/reactions` is public read fanout for confession-level reaction updates. It
  only joins `confession:<confessionId>` rooms and rate-limits subscription
  churn per socket.
- Global Socket.IO server options are built by
  `src/websocket/websocket.adapter.ts` and set CORS to the configured frontend
  origin with credentials enabled.

## Primary Threats And Controls

- Unauthenticated notification access: `WsJwtGuard` rejects missing tokens,
  invalid tokens, and verified tokens without a subject claim before handlers
  use socket identity.
- Cross-user private room joins: notification subscription requests compare the
  requested user ID to `client.data.userId`; mismatches emit
  `subscription:rejected` and do not call `join`.
- Wrong-origin browser connections: websocket CORS is configured from
  `FRONTEND_URL` or `app.frontendUrl`; tests assert the policy is not wildcard
  and does not include unrelated origins.
- Public reaction namespace abuse: reactions do not expose private rooms, keep
  fanout scoped to `confession:<id>`, cap per-IP connections, and apply
  per-socket rate limiting.

## Auth Failure Telemetry

All WebSocket authentication failures in `WsJwtGuard` emit a structured log entry
with the following fields, free of PII (no JWTs, emails, wallet addresses, or
cookies):

- `event`: always `WS_AUTH_FAILURE`
- `reasonCode`: a machine-readable token for programmatic alerting
- `correlationId`: a `crypto.randomUUID()` v4 UUID to correlate the log with the
  `UnauthorizedException` response returned to the client
- `socketId`: the Socket.IO transport identifier (not a user identifier)
- `error`: the `JwtService` error message (e.g. `jwt expired`, `jwt malformed`)

### Reason Codes

| Code | Meaning |
|------|---------|
| `NO_TOKEN_PROVIDED` | Handshake contained no token in auth, Bearer header, or cookie |
| `EXPIRED_TOKEN` | Token passed `verifyAsync` but the `exp` claim is in the past |
| `MALFORMED_TOKEN` | Token failed `verifyAsync` for reasons other than expiry |
| `MISSING_SUBJECT` | Token was cryptographically valid but had no `sub` claim |
| `USER_MAPPING_FAILED` | JWT was valid but the user lookup in the database failed |

### PII Scrubbing

After `WsJwtGuard.extractToken()` reads a value from an `Authorization` header or
a `cookie` header, the raw value is replaced with `<REDACTED>` in the handshake
object so that downstream middleware or error serializers never log the secret.

Clients receive the correlation ID and reason code in the HTTP 401 response body:

```json
{
  "message": "Authentication failed",
  "reasonCode": "EXPIRED_TOKEN",
  "correlationId": "a1b2c3d4-..."
}
```

## Validation Notes

- Unit coverage lives in
  `src/notifications/gateways/notification.gateway.spec.ts` and
  `test/reactions.gateway.spec.ts`.
- Browser smoke validation, when needed, should connect from the configured
  frontend origin and then repeat from a non-allowed origin to confirm the
  Socket.IO CORS rejection appears in the browser console/network panel.
