# Public Traction Metrics

Xconfess exposes aggregate-only traction data from:

```http
GET /api/public/traction
```

The endpoint is public, read-only, short-cacheable, rate limited, and versioned with `schemaVersion`.

## Definitions

- Total registered users: count of persisted account rows in `users`.
- DAU: unique pseudonymous actors with at least one meaningful product action in the last 24 hours.
- WAU: unique pseudonymous actors with at least one meaningful product action in the last 7 days.
- MAU: unique pseudonymous actors with at least one meaningful product action in the last 30 days.
- Meaningful actions: login, confession creation, comment creation, reaction creation, message sent, wallet connected, or completed tip.
- Engagement totals: counts from authoritative domain tables for confessions, comments, reactions, and messages.
- Stellar totals: counts from verified tip records and privacy-safe analytics events.

## Privacy Rules

The analytics ingestion boundary rejects sensitive field names before persistence. Analytics events must not include:

- confession bodies;
- private message bodies or ciphertext envelopes;
- passwords or password hashes;
- emails or phone numbers;
- JWTs, session tokens, auth headers, or reset tokens;
- raw IP addresses or full user-agent strings;
- Stellar private keys, secret seeds, or seed phrases.

Public responses include aggregates only. They do not expose user-level records, emails, wallet secrets, confession text, message text, or private moderation payloads.

## Data Integrity

Transaction-derived analytics events use stable idempotency keys based on event type and transaction hash. Request-derived events use stable domain identifiers where available, such as persisted row IDs or caller-provided idempotency keys.

Zeros are valid. Xconfess must not seed or fabricate traction values.
