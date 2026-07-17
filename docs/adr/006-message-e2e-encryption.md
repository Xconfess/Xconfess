# ADR-006: Private Message End-to-End Encryption

## Status

Accepted

## Context

Xconfess supports anonymous direct messages between a confession author and a sender. These threads carry sensitive, conversational content that must remain confidential even if the API or database is compromised.

[ADR-004](./004-confession-encryption.md) already encrypts **confession text at rest** using a single server-held AES-256-GCM key. That model is appropriate for content the server must index, moderate, and display on confession pages. Private messages are different:

- Only the two participants should ever read plaintext.
- The server acts as a dumb relay: it stores and delivers ciphertext envelopes but must not be able to decrypt them.
- Each anonymous session identity needs its own long-term key material, with optional user-controlled backup for new devices.

Operational details (API routes, envelope format, key backup) live in [message-e2e-encryption.md](../message-e2e-encryption.md). This ADR records **why** we chose true client-side E2E over extending the confession at-rest scheme.

## Options Considered

- **Option A — Reuse ADR-004 server-side encryption**: Encrypt message bodies with the same application-layer AES-256-GCM key used for confessions. Simple and consistent with existing code, but the server always holds the decryption key — a DB breach or insider with env access exposes all message plaintext. This is at-rest protection, not end-to-end confidentiality.

- **Option B — Server-side decryption with per-user keys**: Store a data-encryption key per anonymous identity on the server (wrapped by a master key). Slightly better key isolation than Option A, but the server still performs encrypt/decrypt and can read every message. Does not meet the threat model for “server cannot read DMs.”

- **Option C — True E2E (X25519 + HKDF-SHA256 + AES-256-GCM)**: Generate X25519 key pairs in the browser; publish only public keys to the API; derive a per-thread symmetric key via ECDH and HKDF; encrypt message bodies client-side before `POST`. Server stores ciphertext JSON envelopes and rejects plaintext creates/replies.

- **Option D — MLS / Double Ratchet (Signal-style)**: Forward secrecy and post-compromise security with a full ratcheting protocol. Strongest long-term messaging security, but substantially more client and server complexity than needed for confession-scoped threads with a small participant set.

## Decision

We chose **Option C** — **X25519 key exchange, HKDF-SHA256 key derivation, and AES-256-GCM** for message payloads.

**Why not reuse ADR-004?** Confession encryption protects a shared datastore from outsiders; message E2E protects content from the platform itself. Mixing both into one server-held key would conflate threat models and leave DMs readable to anyone with production secrets.

**Why X25519 + HKDF?** Each anonymous session registers an X25519 public key. For a thread `threadId = "{confessionId}:{senderAnonymousUserId}"`, both participants derive the same 256-bit AES key:

```
sharedSecret = X25519(myPrivateKey, peerPublicKey)
salt         = SHA-256(threadId)
threadKey    = HKDF-SHA256(sharedSecret, salt, info="xconfess-e2e-v1", length=256)
```

X25519 is widely supported in Web Crypto, compact on the wire, and avoids negotiating TLS-adjacent RSA/ECDH variants. HKDF binds the derived key to a specific confession thread so keys are not reused across conversations.

**Why AES-256-GCM for payloads?** Same authenticated-encryption primitive as ADR-004, but keyed by the per-thread secret that never leaves clients. Envelopes (`v`, `alg`, `iv`, `ct`) are validated server-side; plaintext bodies are rejected.

**Why not Option D?** Confession-linked DMs are 1:1, relatively low volume, and device-bound keys with optional passphrase backup are sufficient for the current product scope. A ratcheting protocol can be revisited if we add group chats or stronger forward-secrecy requirements.

Private keys stay in IndexedDB by default; optional PBKDF2-wrapped backups let users recover on a new device without the server ever seeing the private key.

## Consequences

### Positive

- Server and database breaches expose only ciphertext — not message plaintext
- Distinct, documented threat model separate from confession at-rest encryption (ADR-004)
- Browser-native Web Crypto (X25519, HKDF, AES-GCM) with a shared reference implementation for client and server validation
- API can enforce encrypted-only writes without trusting client honesty for reads

### Negative

- Users who lose device keys and skip backup cannot decrypt historical messages (by design)
- Server cannot search, moderate, or generate previews from message body text — notifications use `[Encrypted message]`
- Key rotation and multi-device sync require explicit public-key re-registration and backup flows
- More client complexity than server-side encryption (key store, peer key fetch, decrypt errors in UI)

## References

- [message-e2e-encryption.md](../message-e2e-encryption.md) — operational protocol, API, and edge cases
- [ADR-004: Confession Encryption at Rest](./004-confession-encryption.md) — related but separate at-rest scheme
- xconfess-backend/src/messages/crypto/message-e2e.crypto.ts
- xconfess-backend/src/messages/crypto/message-e2e.crypto.spec.ts
- xconfess-backend/test/message-e2e-key-exchange.e2e-spec.ts
- xconfess-frontend/app/lib/crypto/messageE2E.ts
- xconfess-frontend/app/lib/crypto/messageKeyStore.ts
- Issue #1340 (implementation), #1384 (this ADR)
