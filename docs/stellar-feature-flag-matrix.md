# Stellar Feature Flag Matrix

This document describes the three operational modes controlled by the `STELLAR_FEATURES_ENABLED` environment variable, the required configuration for each mode, and the behavior differences.

## Operational Modes

| Mode | `STELLAR_FEATURES_ENABLED` | Description |
|------|---------------------------|-------------|
| **Disabled** | `false` (default) | No Stellar integration; backend boots without contract IDs or server secret. |
| **Read-only / Testnet** | `true` | Stellar features active; reads from testnet Horizon/RPC. Contract IDs required. |
| **Full Contract Invocation** | `true` | All Stellar features active; server secret required for signing transactions. |

## Environment Variable Requirements

| Variable | Disabled | Read-only / Testnet | Full Invocation |
|----------|----------|-------------------|-----------------|
| `STELLAR_FEATURES_ENABLED` | `false` | `true` | `true` |
| `STELLAR_NETWORK` | — (ignored) | `testnet` | `testnet` or `mainnet` |
| `STELLAR_HORIZON_URL` | — (default used) | Optional (default: testnet Horizon) | Optional (default: testnet Horizon) |
| `STELLAR_SOROBAN_RPC_URL` | — (default used) | Optional (default: testnet Soroban RPC) | Optional (default: testnet Soroban RPC) |
| `CONFESSION_ANCHOR_CONTRACT_ID` | **optional** | **required** | **required** |
| `REPUTATION_BADGES_CONTRACT_ID` | **optional** | **required** | **required** |
| `TIPPING_SYSTEM_CONTRACT_ID` | **optional** | **required** | **required** |
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
| Anonymous Tipping | `TIPPING_SYSTEM_CONTRACT_ID` | Handles XLM tipping with receipts | v1.0.0 |

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

No Stellar-related environment variables are required. The backend boots and all non-Stellar features work normally.

## Testnet Setup

To enable Stellar features against testnet:

```env
STELLAR_FEATURES_ENABLED=true
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-rpc-testnet.stellar.org
CONFESSION_ANCHOR_CONTRACT_ID=<your-deployed-contract-id>
REPUTATION_BADGES_CONTRACT_ID=<your-deployed-contract-id>
TIPPING_SYSTEM_CONTRACT_ID=<your-deployed-contract-id>
```

## Production Setup

```env
STELLAR_FEATURES_ENABLED=true
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-rpc.stellar.org
STELLAR_SERVER_SECRET=S...
CONFESSION_ANCHOR_CONTRACT_ID=<deployed-contract-id>
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
