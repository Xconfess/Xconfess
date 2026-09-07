# End-to-End Encrypted Private Messaging

This document describes the E2E encryption protocol for Xconfess anonymous direct messages (issue #1340).

## Threat model

| Actor | Can read message plaintext? |
|-------|----------------------------|
| Server / DB breach | **No** — only ciphertext envelopes are stored |
| Network observer (TLS terminated) | **No** — ciphertext in transit |
| Other users | **No** — without thread keys |
| Participant with valid private key | **Yes** |
| Participant who lost private key (no backup) | **No** — by design |

The server never receives private keys. Public keys are published per anonymous session identity.

## Cryptographic design

### Identity keys

Each anonymous session identity (`anonymous_user`) has an **X25519 key pair**:

- **Private key**: generated in the browser, stored in **IndexedDB** (`xconfess-message-keys`).
- **Public key**: registered via `PUT /api/messages/keys`.

### Thread key derivation

A conversation thread is identified by:

```
threadId = "{confessionId}:{senderAnonymousUserId}"
```

Both the confession author and the message sender derive the same AES-256-GCM key:

```
sharedSecret = X25519(myPrivateKey, peerPublicKey)
salt         = SHA-256(threadId)
threadKey    = HKDF-SHA256(sharedSecret, salt, info="xconfess-e2e-v1", length=256)
```

### Ciphertext envelope

Stored in `messages.content` and `messages.replyContent`:

```json
{
  "v": 1,
  "alg": "aes-256-gcm",
  "iv": "<base64url 12-byte nonce>",
  "ct": "<base64url ciphertext + auth tag>"
}
```

The API rejects plaintext bodies for create/reply operations. Envelope parsing
is strict: the payload must be a JSON object with exactly the four fields
above (no extra fields), `iv` must be base64url and decode to exactly 12
bytes, and `ct` must be base64url and decode to at least 16 bytes (the
minimum possible AES-GCM auth tag). Payloads that are well-formed JSON but
fail any of these checks — wrong algorithm, wrong nonce length, truncated
ciphertext, or unexpected fields — are rejected the same as plaintext.

## Key exchange flow

```mermaid
sequenceDiagram
  participant Sender as Sender browser
  participant Server as Xconfess API
  participant Author as Author browser

  Sender->>Sender: Generate X25519 keypair (if none)
  Sender->>Server: PUT /messages/keys { publicKey }
  Author->>Author: Generate X25519 keypair (if none)
  Author->>Server: PUT /messages/keys { publicKey }

  Sender->>Server: GET /messages/keys/{authorAnonId}
  Server-->>Sender: { publicKey }
  Sender->>Sender: ECDH + encrypt plaintext
  Sender->>Server: POST /messages { content: envelope }

  Author->>Server: GET /messages?confession_id&sender_id
  Server-->>Author: ciphertext envelopes
  Author->>Server: GET /messages/keys/{senderAnonId}
  Author->>Author: ECDH + decrypt

  Author->>Author: encrypt reply
  Author->>Server: POST /messages/reply { reply: envelope }
  Sender->>Sender: decrypt reply with same thread key
```

## Key storage and recovery

### Current key lifecycle

1. When a session first opens Messages, the client requests its key status from
   `GET /api/messages/keys/me`.
2. If neither the server nor IndexedDB has a key for that anonymous identity,
   the browser generates an X25519 pair, saves it locally, and registers only
   its public key with `PUT /api/messages/keys`.
3. Subsequent visits use the private key stored under that anonymous identity
   in IndexedDB. The server stores the current public key, its version, and an
   optional encrypted backup; it never receives the private key or recovery
   passphrase.
4. The client fetches a peer's current public key whenever it encrypts or
   decrypts a thread. There is no server-held copy of historical private keys.

### Default (device-bound)

Private keys live in IndexedDB. Clearing site data or switching browsers leaves
the device without its private key. If the server already has a public key for
that identity, the client enters recovery mode instead of generating a
replacement key. Old messages are unreadable unless the private key is
restored from a backup.

### Optional passphrase backup

Users may save a recovery passphrase:

1. Client wraps the private key with **PBKDF2-SHA256** (310k iterations) + **AES-256-GCM**.
2. Wrapped blob uploaded via `PUT /messages/keys` as `encryptedKeyBackup`.
3. Server stores the blob but **cannot decrypt** it.

Restore on a new device:

1. `GET /api/messages/keys/backup`
2. User enters passphrase → unwrap private key → save to IndexedDB

## Edge cases

### New device, no backup

- If this identity has never registered a public key, a fresh key pair is generated and registered automatically (nothing to lose).
- If a public key is **already registered** for this identity (e.g. the user messaged from another device) but this device has no matching local private key, the client does **not** silently generate and register a replacement key — doing so would overwrite the registered public key and make existing messages permanently unreadable. Instead the UI shows a blocking notice offering to restore from a passphrase backup or to explicitly "start fresh" (with a confirmation, since it is irreversible).
- **Historical messages remain ciphertext** — the UI shows: `[Unable to decrypt — wrong device or missing recovery key]`.
- New messages work after both parties fetch the new public keys.
- If no recovery backup has been configured yet, the Messages page shows a persistent reminder to set one up before it's needed.

### New device, with backup

- User restores via passphrase before reading threads.
- Same private key → all historical thread messages decrypt normally.

### Peer has not registered a key yet

- `GET /messages/keys/{id}` returns **404**.
- Send is blocked until the recipient opens Messages (or any flow that registers keys).

### Key rotation

- Registering a different `publicKey` for the same anonymous identity increments `messageKeyVersion`.
- The current API keeps one public key per anonymous identity. It does not
  retain previous public keys or attach a key version to individual message
  envelopes.
- Messages encrypted to an older key remain decryptable only with the matching
  private key and the peer public key used when they were encrypted. Replacing
  a public key can therefore make historical messages undecryptable in the
  current client, even if a participant still has an old private key.
- Rotation is intentionally manual today: it happens only when a user confirms
  **Start fresh** after recovery is unavailable. The client never silently
  rotates a key merely because IndexedDB is empty.

### Rotation follow-up

Automatic or routine rotation is not implemented. A future rotation design
must preserve a versioned public-key history and record recipient key versions
with each envelope (or use per-message key wrapping). It must also provide a
safe migration and recovery flow before making rotation available outside the
explicit destructive **Start fresh** action.

### Notifications

- Email/push previews use the constant `[Encrypted message]` — no plaintext leaks server-side.

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/api/messages/keys` | Register session public key (+ optional backup) |
| `GET` | `/api/messages/keys/me` | Current session key status |
| `GET` | `/api/messages/keys/backup` | Download wrapped private key backup |
| `GET` | `/api/messages/keys/:anonymousUserId` | Fetch participant public key |

## Tests

- **Unit**: `xconfess-backend/src/messages/crypto/message-e2e.crypto.spec.ts` — ECDH, encrypt/decrypt, tampering, malformed/replayed envelope rejection, backup wrap/unwrap, lost-key simulation.
- **Unit**: `xconfess-backend/src/messages/messages.service.spec.ts` — rejects plaintext and malformed envelopes on `create`, persists valid envelopes.
- **E2E**: `xconfess-backend/test/message-e2e-key-exchange.e2e-spec.ts` — key registration, encrypted send/reply through the HTTP layer.
- **Frontend**: `xconfess-frontend/app/lib/hooks/__tests__/useMessageE2E.test.ts` — first-run key generation, lost-key recovery prompt (no silent overwrite), restore-from-backup, start-fresh confirmation, and that the recovery passphrase is never logged.

Run:

```bash
npm run test --workspace=xconfess-backend -- message-e2e
```

## Implementation files

| Area | Path |
|------|------|
| Crypto (server reference) | `xconfess-backend/src/messages/crypto/message-e2e.crypto.ts` |
| Key API | `xconfess-backend/src/messages/message-keys.service.ts` |
| Client crypto | `xconfess-frontend/app/lib/crypto/messageE2E.ts` |
| Client key store | `xconfess-frontend/app/lib/crypto/messageKeyStore.ts` |
| React hook | `xconfess-frontend/app/lib/hooks/useMessageE2E.ts` |
