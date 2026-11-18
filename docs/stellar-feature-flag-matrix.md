# Stellar Feature Flag Matrix

## Overview

This document describes the three operational modes controlled by the `STELLAR_FEATURES_ENABLED` environment variable, the required configuration for each mode, and the behavior differences. It also serves as the contributor guide for running Stellar/Soroban functionality locally against testnet.

For failure symptoms and copy-paste-safe diagnostic commands, see the
[Stellar Testnet troubleshooting guide](STELLAR_TESTNET_GUIDE.md).

## Operational Modes

| Mode | `STELLAR_FEATURES_ENABLED` | Description |
|------|---------------------------|-------------|
| **Disabled** | `false` (default) | No Stellar integration; backend boots without contract IDs or server secret. |
| **Read-only / Testnet** | `true` | Stellar features active; reads from testnet Horizon/RPC. Contract IDs required. |
| **Full Contract Invocation** | `true` | All Stellar features active; server secret required for signing transactions. |

## Environment Variable Requirements

| Variable | Disabled | Read-only / Testnet | Full Invocation |
|----------|----------|-------------------|----------------|
| `STELLAR_FEATURES_ENABLED` | `false` | `true` | `true` |
| `STELLAR_NETWORK` | — (ignored) | `testnet` | `testnet` or `mainnet` |
| `STELLAR_HORIZON_URL` | — (default used) | Optional (default: testnet Horizon) | Optional (default: testnet Horizon) |
| `STELLAR_SOROBAN_RPC_URL` | — (default used) | Optional (default: testnet Soroban RPC) | Optional (default: testnet Soroban RPC) |
| `CONFESSION_ANCHOR_CONTRACT_ID` | **optional** | **required** | **required** |
| `REPUTATION_BADGES_CONTRACT_ID` | **optional** | **required** | **required** |
| `TPPING_SYSTEM_CONTRACT_ID` | **optional** | **required** | **required** |
| `STELLAR_SERVER_SECRET` | **optional** | **optional** | **required** (production/staging) |

## Contract ID Expectations by Network

When `STELLAR_FEATURES_ENABLED=true`, contract IDs must be provided via environment variables or deployment metadata. The backend validates that:

1. All three contract IDs are present.
2. The configured `STELLAR_NETWORK` matches the deployment metadata network (if metadata is available).
3. Any explicitly configured contract IDs match deployment metadata (no stale env vars from another network).

| Contract | Env Var | Purpose | Contract Version |
|----------|---------|---------|-----------------|
| Confession Anchor | `CONFESSION_ANCHOR_CONTRACT_ID` | Anchors confession hashes on-chain | v0.1.0 |
| Reputation Badges | `REPUTATION_BADGES_CONTRACT_ID` | Awards and manages reputation badges | v0.0.0 |
| Anonymous Tipping | `TPPING_SYSTEM_CONTRACT_ID` | Handles XLM tipping with receipts | v1.0.0 |

## Feature Availability by Mode

| Feature | Disabled | Read-only | Full |
|---------|----------|-----------|------|
| Backend boots without Stellar config | Yes | No | No |
| Confession anchoring | No | Read-only (verify) | Full (anchor + verify) |
| Tipping | No | No | Full (send, verify, reconcile) |
| Reputation badges | No | Read-only (query) | Full (award, adjust, transfer) |
| Stellar config endpoint (`GET /stellar/config`) | Returns `null` contract IDs | Returns configured IDs | Returns configured IDs |
| Horizon balance checks | No | Yes | Yes |
| Transaction verification | No | Yes (Horizon lookup) | Yes |
| Contract invocation endpoint | No | Admin-only (read-only calls) | Admin-only (full calls) |

## Local Development Setup

For local development with Stellar features **disabled** (default):

```env
STELLAR_FEATURES_ENABLED=false
NODE_ENV=development
```

No Stellar-related environment variables are required. The backend boots and all non-Stellar features work normally. This is the recommended mode for day-to-day local development that does not touch chain functionality.

## Testnet Setup

To enable Stellar features against testnet:

```env
STELLAR_FEATURES_ENABLED=true
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-rpc-testnet.stellar.org
CONFESSION_ANCHOR_CONTRACT_ID=<your-deployed-contract-id>
REPUTATION_BADGES_CONTRACT_ID<<your-deployed-contract-id>
TIPPING_SYSTEM_CONTRACT_ID=<your-deployed-contract-id>
```

## Testnet Wallet Prerequisites

Before running Stellar/Soroban functionality locally against testnet, you need a testnet wallet and funded accounts:

1. **Create a testnet keypair.** Generate a new Stellar keypair with any Stellar SDK or the `Stellar CLI (`stellar-keys new`). This produces a public key (starting with `G`) and a secret key (starting with `S`).

2. **Fund the account via Friendbot.** Testnet accounts must be funded before they can sign transactions. Use the Stellar Friendbot (`https://friendbot.stellar.org`) to create and fund a testnet account. Friendbot only works on testnet and never on mainnet.

3. **Confirm the balance.** Query Horizon testnet for the account to confirm it exists and has a non-zero XLM balance:

   ```bash
   curl "https://horizon-testnet.stellar.org/accounts/<G_ACCOUNT_ID>"
   ```

4. **Deploy the contracts.** The three contracts (Confession Anchor, Reputation Badges, Anonymous Tipping) must be deployed to testnet before their IDs can be set. Use the Soroban CLI to build and deploy each contract, and copy the resulting contract ID into the corresponding env variable.

5. **Fund the signing account for invocations.** Full contract invocation consumes fees and may require reserves for contract data. Ensure the account used for `STELLAR_SERVER_SECRET` has enough testnet XLM.

## Safe Key Handling Guidance

@Stellar secret keys grant full control over the account. Treat them as credentials:

- **Never commit secrets.** Do not check `STELLAR_SERVER_SECRET` or any `S...` key into version control. Keep them in a local `.env` file that is git-ignored, or in a secret manager.
- **Use a dedicated testnet key.** Never reuse a mainnet key for testnet development. Testnet keys should be throwaway and unfunded on mainnet.
- **Rotate on leak.** If a testnet secret is accidentally exposed, generate a new keypair, fund it via Friendbot, and update your local env. Testnet funds are disposable, but the habit of rotation matters.
- **Scope secrets to the process.** Prefer process-level environment variables or a secret manager over global shell profiles. Avoid exporting `STELLAR_SERVER_SECRET` in shared shell sessions.
- **Never log secrets.** Ensure application logs and error reports do not include the value of `STELLAR_SERVER_SECRET`. Redact it in any diagnostic output.
- **Prefer read-only for daily work.** Only set `STELLAR_SERVER_SECRET` if you actually need to sign transactions. Read-only testnet work\ndoes not require a secret.

## Disabling Stellar Features for Normal Local Development

To turn Stellar features back off after experimenting with testnet:

1. Set `STELLAR_FEATURES_ENABLED=false` in your local environment.
2. Remove or leave blank the Stellar-specific variables (`STELLAR_NETWORK`, `STELLAR_HORIZON_URL`, `STELLAR_SOROBAN_RPC_URL`, `CONFESSION_ANCHOR_CONTRACT_ID`, `REPUTATION_BADGES_CONTRACT_ID`, `TPPING_SYSTEM_CONTRACT_ID`, `STELLAR_SERVER_SECRET`). They are ignored when features are disabled.
3. Restart the backend. It will boot without requiring contract IDs or a server secret.

With features disabled, Stellar-related endpoints return safe defaults (`null` contract IDs, no balance queries) and no network calls to Horizon or Soroban RPC are made. This keeps normal local development fast and independent of external networks.

## Production Setup

```env
STELLAR_FEATURES_ENABLED=true
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-rpc.stellar.org
STELLAR_SERVER_SECRET=S...
CONFESSION_ANCHOR_CONTRACT_ID<<deployed-contract-id>
REPUTATION_BADGES_CONTRACT_ID=<deployed-contract-id>
TIPPING_SYSTEM_CONTRACT_ID=<deployed-contract-id>
```

`STELLAR_SERVER_SECRET` is required in production and staging when features are enabled, as it is needed for signing contract invocations.

## Graceful Degradation

- When `STELLAR_FEATURES_ENABLED=false`, the Stellar module initializes in a minimal state. All Stellar-related API endpoints return safe defaults (null contract IDs, no balance queries).
- Network errors from Horizon or Soroban RPC are handled with retry logic and circuit breakers. A transient failure does not crash the backend.
- If `STELLAR_SERVER_SECRET` is missing in production, the backend will fail to start, preventing silent misconfiguration.

## Error Conditions

| Condition | Behavior |
|-----------|----------|
| Missing contract IDs with features enabled | Backend fails to boot with descriptive error |
| Network mismatch (env var vs deployment metadata) | Backend fails to boot |
| Contract ID mismatch (env var vs deployment metadata) | Backend fails to boot |
| Missing `STELLAR_SERVER_SECRET` in production | Backend fails to boot |
| Horizon/Soroban RPC unreachable | Operations fail gracefully with retries; no crash |
