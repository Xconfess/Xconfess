# ADR-004: Confession Encryption at Rest

## Status

Accepted

## Context

Confessions are anonymous by design. Storing confession text in plaintext in the database means a database breach would expose all content directly. Encrypting confession content at rest adds a layer of protection even if the database is compromised, as long as the encryption key is stored separately.

## Options Considered

- **Option A — Plaintext storage**: No encryption. Simple to implement and query, but a database breach exposes all confession content.
- **Option B — AES-256-GCM application-layer encryption**: Encrypt confession text in the NestJS service layer before writing to the database. Decrypt on read. Key stored in environment variable.
- **Option C — PostgreSQL pgcrypto column encryption**: Encrypt at the database level using pgcrypto. Keeps encryption logic out of application code but ties it to PostgreSQL.

## Decision

We chose **Option B** — AES-256-GCM encryption in the application layer.

AES-256-GCM provides authenticated encryption (integrity + confidentiality). Implementing it in the service layer keeps encryption logic version-controlled and testable. The encryption key is injected via environment variable and never committed to source control.

## Consequences

### Positive

- Database breach does not expose plaintext confession content
- Encryption logic is tested and version-controlled alongside application code
- GCM mode detects tampering via authentication tag

### Negative

- Full-text search on encrypted fields is not possible — search indexes must use separate plaintext fields or hashes
- Key rotation requires re-encrypting all existing confession rows
- Loss of the encryption key means permanent loss of all confession content

## References

- xconfess-backend/src/utils/confession-encryption.ts
- xconfess-backend/src/utils/confession-encryption.spec.ts
- xconfess-backend/src/encryption/
