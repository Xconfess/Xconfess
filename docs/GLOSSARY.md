# xConfess Glossary

## A

### Anchoring

The process of recording a cryptographic hash (SHA-256) of a confession on the Stellar blockchain via Soroban smart contracts. The hash can be checked later without putting the confession text or an author identifier in the contract record; the hash does not prevent identification from the confession or other data. See the [Anchoring section](DEMO_SCRIPT.md#4-stellar-flow--confession-anchoring) of the demo script, the [contract ABI reference](contract-abi-reference.md#confession-anchor-contract), and the [Soroban setup guide](SOROBAN_SETUP.md) for contract deployment and interaction details.

### Anonymous Tipping

A Stellar-based feature that lets wallet holders send tips to confession authors. The wallet signs the transaction, and the backend verifies it on-chain before recording the tip idempotently. A public wallet address can link on-chain activity. See the [Anonymous Tipping contract reference](contract-abi-reference.md#anonymous-tipping-contract) and the [Stellar anchoring and tipping runbook](stellar-anchor-and-tipping-runbook.md) for operational details.

## Anonymous Identity Terminology

Use these terms consistently in contributor documentation. The product's use of
“anonymous” describes how an identity is presented in the app; it does not
guarantee that activity cannot be linked to an account, device, network, or
wallet.

### Anonymous user

The persisted `AnonymousUser` record that groups app activity under an ID. It
can be unlinked or associated with a registered account through
`user_anonymous_users`.

### Generated identifier

The database-generated UUID in `AnonymousUser.id`, returned by APIs as
`anonymousUserId`. It references app activity; it is not a credential or proof
of identity.

### Session

Protected API requests use a stateless JWT rather than a server-side login
session record. For an authenticated account's anonymous context, the backend
reuses its newest anonymous-user link created within the default 24-hour window,
or creates a new link when none is found. This window is a reuse policy, not a
unique browser or device session.

### Wallet identity

A Stellar wallet address can be used to find or create an anonymous user through
a stored fingerprint. The backend computes the fingerprint with HMAC-SHA-256
when an application secret is configured and otherwise with SHA-256. This
supports continuity for the same address; it does not make the address or its
on-chain activity unlinkable.

## H

### Health Endpoints

Three backend endpoints for monitoring system status: `GET /api/health/live` (liveness - process responsive, no dependency checks), `GET /api/health/ready` (readiness - checks Postgres, Redis, BullMQ queues, and schema), and `GET /api/health` (legacy alias for `/ready`). Use `/live` for quick smoke tests and `/ready` for pre-deployment verification. See the [Health Check Documentation](../xconfess-backend/src/health/HEALTH_CHECK_DOCUMENTATION.md) for detailed troubleshooting and response schemas.
