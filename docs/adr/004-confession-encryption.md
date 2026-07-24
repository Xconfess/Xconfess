# ADR-004: Confession Encryption at Rest & Content Storage Policy

## Status

Accepted

## Context

Confessions are anonymous by design. Storing confession text in plaintext in the database means a database breach would expose all content directly. Encrypting confession content at rest adds a layer of protection even if the database is compromised, as long as the encryption key is stored separately.

Additionally, user submissions may contain raw Markdown formatting and potential XSS/malicious HTML payloads. A clear definition of storage format and sanitization policy is required across backend services and frontend renderers.

## Options Considered

- **Option A — Plaintext storage**: No encryption. Simple to implement and query, but a database breach exposes all confession content.
- **Option B — AES-256-GCM application-layer encryption with raw Markdown storage**: Encrypt raw Markdown confession text in the NestJS service layer before writing to the database after passing through backend sanitization middleware. Decrypt on read. Key stored in environment variable.
- **Option C — PostgreSQL pgcrypto column encryption**: Encrypt at the database level using pgcrypto. Keeps encryption logic out of application code but ties it to PostgreSQL.

## Decision

We chose **Option B** — AES-256-GCM application-layer encryption with raw Markdown storage policy.

### Storage & Sanitization Policy Details:
1. **Raw Markdown Storage**: Confessions store raw Markdown text rather than rendered HTML. This maintains rendering flexibility across clients and web renderers.
2. **Sanitization Boundary**: Incoming request payloads pass through `SanitizationMiddleware` at the API boundary before encryption or storage. Harmful HTML constructs (e.g. `<script>`, `javascript:` pseudo-protocols, dangerous event listeners like `onerror`/`onclick`, `<iframe`, `<object`) are stripped. Safe markdown HTML tags (`h1`-`h6`, `b`, `i`, `em`, `strong`, `a`, `img`, `code`, `pre`, `ul`, `ol`, `li`, `blockquote`) and safe attributes are allowed.
3. **Encryption Flow**: Clean, sanitized raw Markdown is encrypted at rest using AES-256-GCM. Decrypted raw Markdown is served to client applications where frontend components safely render it.

## Consequences

### Positive

- Database breach does not expose plaintext confession content
- Encryption logic is tested and version-controlled alongside application code
- GCM mode detects tampering via authentication tag
- Dangerous input is sanitized at the backend boundary before encryption, preventing unsafe persistence
- Raw Markdown storage preserves intended formatting without HTML bloat in database

### Negative

- Full-text search on encrypted fields is not possible — search indexes must use separate plaintext fields or hashes
- Key rotation requires re-encrypting all existing confession rows
- Loss of the encryption key means permanent loss of all confession content

## References

- xconfess-backend/src/utils/confession-encryption.ts
- xconfess-backend/src/utils/sanitize.utils.ts
- xconfess-backend/src/middleware/sanitization.middleware.ts
- shared/fixtures/malicious-payloads.ts
- xconfess-backend/test/sanitization.middleware.spec.ts
