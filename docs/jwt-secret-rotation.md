# JWT signing secret rotation

`JWT_SECRET` signs every newly issued token. During a rotation, set the old
value as `JWT_PREVIOUS_SECRET` and keep it for at most
`JWT_SECRET_ROTATION_OVERLAP_SECONDS` (default `86400`). HTTP Passport auth and
`JwtService.verify()` accept a valid token signed by either key. A token signed
by `JWT_PREVIOUS_SECRET` whose `iat` is older than the overlap window is
rejected even if its `exp` is still in the future.

## Rollout

1. Generate a new secret: `openssl rand -base64 48`.
2. Set `JWT_PREVIOUS_SECRET` to the current `JWT_SECRET`.
3. Set `JWT_SECRET` to the new value and deploy all backend replicas.
4. Confirm new logins, existing sessions, and WebSocket connections succeed.
5. After the overlap window plus one full token lifetime, remove
   `JWT_PREVIOUS_SECRET` and deploy again.

## Rollback

If the new key must be abandoned before the overlap expires, set `JWT_SECRET`
back to the previous value, keep the failed value in `JWT_PREVIOUS_SECRET`, and
deploy. Tokens issued with either key remain valid during the overlap. Remove
`JWT_PREVIOUS_SECRET` only after every token issued with the failed key has
expired.

Never commit either secret. Store both in the deployment secret manager and
restart all replicas so they use the same key set.
