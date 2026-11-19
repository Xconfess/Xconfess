<!-- markdownlint-disable MD013 -->

# XConfess embedded wallet architecture

The embedded wallet is a client-side, non-custodial wallet. Keypairs are generated or imported in the browser with `@stellar/stellar-sdk`. The secret key is encrypted before it is written to browser storage.

## Key lifecycle

- `Keypair.random()` or an imported Stellar secret creates the account locally.
- A 6–12 digit wallet PIN derives a 256-bit key with PBKDF2-SHA-256 and 310,000 iterations.
- Predictable PINs are rejected, and five failed unlock attempts trigger a five-minute local lockout.
- The secret is encrypted with AES-256-GCM using a random salt and IV.
- Only the public key may be registered with the backend. The PIN, plaintext secret, and unlocked keypair must never be sent to an API, logged, or placed in URLs.
- Unlocking is ephemeral. Callers should discard the returned keypair immediately after signing and lock the wallet after inactivity.

## Backup and recovery

The downloadable backup is ciphertext plus its versioned encryption metadata. It is not a recovery phrase and XConfess cannot recover a forgotten PIN. Users should store the encrypted backup separately from the PIN.

The Wallet & Security surface reports when a backup is still needed, supports local PIN rotation by decrypting and re-encrypting in memory, and requires the PIN before revealing an exportable private key. Removing local wallet data is explicit and warns that recovery is impossible without a backup or the original secret.

## Network and transaction flow

The wallet currently defaults to Stellar Testnet and displays the configured Testnet/Mainnet network in the UI. The send flow validates inputs, shows destination/amount/fee/network for review, unlocks locally, signs in the browser, submits the signed transaction, and presents a transaction hash and explorer link. Activity is read from Horizon. Freighter remains an optional external provider, not a prerequisite for the embedded flow.

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

Native XLM payments use Horizon account loading, a native payment operation, a bounded text memo, a 60-second timeout, local signing, and Horizon submission. Technical failures are mapped to safe user-facing states; raw SDK/Horizon details are not shown. Existing Soroban/anchoring remains optional, but the prepared contract transaction can now be signed locally by the embedded wallet with the wallet PIN; Freighter remains an advanced external fallback. It is not required to browse or publish ordinary anonymous confessions.

## Local Stellar testnet development guide

This guide explains how to run the Stellar/Soroban functionality locally against Stellar Testnet. It is intended for contributors who need to exercise the embedded wallet, Horizon reads, and optional Soroban/anchoring flows without touching Mainnet.

### Required configuration

Set the following environment variables in your local `.env` (or equivalent) before starting the app:

- `STELLAR_NETWORK=testnet` — selects Testnet Horizon/RPC endpoints and network passphrase.
- `STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org` — Horizon endpoint used for account loading and payment submission.
- `STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org` — Soroban RPC endpoint used for optional contract simulation and submission.
- `STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015` — must match the selected network.
- `ENABLE_TESTNET_FUNDING=true` — required to expose `POST /wallet/fund/testnet`. Leave unset or `false` in any environment that must not call friendbot.
- `STELLAR_SERVER_SECRET` — server-side infrastructure key only. Never use it to sign user-owned payments.

Restart the Next.js and NestJS processes after changing these values. Confirm the active network is shown as Testnet in the Wallet & Security UI before running any flow.

### Testnet wallet prerequisites

- A browser session with the embedded wallet created or imported locally. The wallet defaults to Testnet.
- A funded Testnet account. Either fund it through the in-app Testnet funding action (when `ENABLE_TESTNET_FUNDING=true`) or use the public Stellar friendbot for the account's public key.
- A small XLM balance for fees and minimum reserve. Testnet XLM has no real value.
- Optional: a Soroban contract ID if you are exercising anchoring. The prepared contract transaction can be signed locally with the wallet PIN; Freighter remains an advanced external fallback.
- Optional: the Freighter extension if you want to compare the external-provider path. It is not required for the embedded flow.

### Safe key-handling guidance

- Never commit secrets, PINs, decrypted backups, or `.env` files containing `STELLAR_SERVER_SECRET` to the repository.
- Only the public key may be registered with the backend. Do not send the PIN, plaintext secret, or unlocked keypair to any API, log, analytics event, or URL.
- Keep the wallet PIN separate from the encrypted backup. XConfess cannot recover a forgotten PIN, and losing both the backup and PIN is unrecoverable by design.
- Treat Testnet keys as disposable. Do not reuse a Testnet secret on Mainnet, and do not reuse a Mainnet secret on Testnet.
- Unlocking is ephemeral: discard the returned `Keypair` immediately after signing, and lock the wallet after inactivity.
- Treat QR codes and pasted destinations as untrusted input. Review destination, amount, fee, and network before signing.
- Do not log raw SDK or Horizon errors that may include signed payloads or account details.

### Disabling Stellar features for normal local development

Most contributors do not need Stellar or Soroban running. To keep normal local development fast and avoid accidental Testnet calls:

- Leave `ENABLE_TESTNET_FUNDING` unset or set it to `false` so `POST /wallet/fund/testnet` is disabled.
- Do not set `STELLAR_SERVER_SECRET` in local environments that do not need server-side Stellar operations.
- Leave `STELLAR_SOROBAN_RPC_URL` unset if you are not exercising anchoring; the Soroban/anchoring path is optional.
- Skip creating or importing an embedded wallet when working on unrelated surfaces. Confession browsing and publishing do not require a wallet.
- If you must point at a non-Testnet endpoint for a specific test, do it in an isolated environment and never enable Testnet funding against Mainnet.

### Verifying the setup

1. Start the app with the Testnet variables above and confirm the UI reports Testnet.
2. Create or import an embedded wallet and fund it via the Testnet funding action or friendbot.
3. Send a small native XLM payment and confirm a transaction hash and explorer link are shown.
4. Optionally, run a Soroban/anchoring flow and sign the prepared contract transaction locally with the wallet PIN.
5. Check that no PIN, plaintext secret, decrypted backup, or signed payload appears in logs, URLs, or analytics.

### Troubleshooting

- `POST /wallet/fund/testnet` returns disabled: set `ENABLE_TESTNET_FUNDING=true` and restart, and remember funding is limited to one request per user per hour.
- Horizon or RPC errors: verify `STELLAR_HORIZON_URL`, `STELLAR_SOROBAN_RPC_URL`, and `STELLAR_NETWORK_PASSPHRASE` match Testnet and restart the processes.
- Wallet appears locked: unlocking is ephemeral and the UI clears the PIN after signing and after 30 seconds of inactivity. Re-enter the PIN to continue.
- Backup cannot be restored: a backup restores encrypted material only; the original PIN is still required.

### Mainnet warning

This guide is Testnet-only. Before enabling Mainnet, review the Mainnet checklist above, including funding/reserves, Horizon/RPC endpoints, fees, abuse/rate limits, recovery UX, monitoring, legal/compliance requirements, and the full transaction threat model. Testnet funding must never be callable against Mainnet.

