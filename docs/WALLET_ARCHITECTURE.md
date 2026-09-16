# XConfess embedded wallet architecture

The embedded wallet is a client-side, non-custodial wallet. Keypairs are generated or imported in the browser with `@stellar/stellar-sdk`. The secret key is encrypted before it is written to browser storage.

## Key lifecycle

- `Keypair.random()` or an imported Stellar secret creates the account locally.
- A 6–12 digit wallet PIN derives a 256-bit key with PBKDF2-SHA-256 and 310,000 iterations.
- The secret is encrypted with AES-256-GCM using a random salt and IV.
- Only the public key may be registered with the backend. The PIN, plaintext secret, and unlocked keypair must never be sent to an API, logged, or placed in URLs.
- Unlocking is ephemeral. Callers should discard the returned keypair immediately after signing and lock the wallet after inactivity.

## Backup and recovery

The downloadable backup is ciphertext plus its versioned encryption metadata. It is not a recovery phrase and XConfess cannot recover a forgotten PIN. Users should store the encrypted backup separately from the PIN.

## Network and transaction flow

The wallet currently defaults to Stellar Testnet and always displays that network in the UI. A production send/tip flow should prepare an unsigned transaction from Horizon, show destination/amount/fee/network for review, unlock locally, sign in the browser, submit the signed XDR, and verify the returned hash server-side. Freighter remains an optional external provider, not a prerequisite for the embedded flow.

## Security boundaries

The server wallet (`STELLAR_SERVER_SECRET`) is infrastructure-only and must not sign user-owned payments. XConfess must not expose a confession-author-to-address mapping in public APIs. The UI must keep CSP restrictive and treat confession, comment, and message content as untrusted text.

## Mainnet checklist

Before enabling Mainnet, review funding/reserves, Horizon/RPC endpoints, fees, abuse/rate limits, recovery UX, monitoring, legal/compliance requirements, and the full transaction threat model. Testnet funding must never be callable against Mainnet.

## API boundary

The Next.js `/api/wallet` and `/api/wallet/[...path]` routes forward authenticated requests to NestJS while forwarding the session cookie and CSRF header. NestJS exposes `GET /wallet`, `POST /wallet/register`, `POST /wallet/fund/testnet`, `POST /wallet/backup`, and `GET /wallet/backup`. Registration, funding, and backup operations use the existing authenticated rate-limit guard; funding is additionally limited to one request per user per hour and is disabled unless `ENABLE_TESTNET_FUNDING=true`.

## Locking and recovery

The browser never stores a decrypted secret. The wallet is considered locked whenever no operation is actively holding the short-lived `Keypair` returned by `unlockEmbeddedWallet`. The UI clears the PIN field after signing and after 30 seconds of inactivity. A backup restores encrypted material only; the user must still provide the original PIN. Losing both the backup and PIN is unrecoverable by design.

## Privacy and threat model

XSS can expose browser storage or an unlocked keypair, so wallet code does not log secrets, PINs, decrypted backups, or transaction payloads. CSP remains explicit rather than wildcarded. Browser extensions and compromised devices remain residual risks. Public Stellar addresses are inherently observable on-chain; the product should not present an author-to-address mapping in social APIs or analytics. QR codes should be treated as untrusted destination data and payment details must be reviewed before signing.

## Stellar integration boundaries

Native XLM payments use Horizon account loading, a native payment operation, a bounded text memo, a 60-second timeout, local signing, and Horizon submission. Existing Soroban/anchoring code remains a separate optional capability. It is not required to browse or publish ordinary anonymous confessions.

