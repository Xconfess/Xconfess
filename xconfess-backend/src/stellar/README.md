# Usage Example
```typescript
// Get balance
const balance = await stellarService.getAccountBalance('GB...');
// Anchor a confession
await contractService.anchorConfession('hash', Date.now(), 'SC...');
```

# Security Best Practices
- Never log or expose secret keys
- Always validate input (DTOs, addresses, etc.)
- Use environment variables for all secrets
- Restrict contract invocation endpoints to admins only
- Handle all errors and never leak sensitive info in responses
# Stellar Integration Service (xConfess Backend)

## Overview
This module provides secure, robust, and testable integration with the Stellar blockchain and Soroban smart contracts for the xConfess backend.

## Operations Runbook
- For production support workflows, use:
  - [`docs/stellar-anchor-and-tipping-runbook.md`](../../../docs/stellar-anchor-and-tipping-runbook.md)
- This runbook covers:
  - Anchor/tip verification and reconciliation flow.
  - Pending, failed, and replay-safe handling.
  - Required incident evidence before manual intervention/refund decisions.

### Features
- Network switching (testnet/mainnet)
- Transaction building, signing, and verification
- Soroban contract invocation (anchor confessions, etc.)
- Secure key handling (never expose secrets)
- API endpoints for blockchain operations
- Comprehensive unit and integration tests

## API Endpoints

### Get Stellar Network Config
`GET /stellar/config`

Returns the configured network, Horizon/Soroban RPC URLs, and public Soroban contract IDs.
Unset contract IDs are `null`. This endpoint never returns `STELLAR_SERVER_SECRET` or deployer keys.

When `STELLAR_FEATURES_ENABLED=true`, bootstrap validation requires
`CONFESSION_ANCHOR_CONTRACT_ID`, `REPUTATION_BADGES_CONTRACT_ID`, and `TIPPING_SYSTEM_CONTRACT_ID`.
With `STELLAR_FEATURES_ENABLED=false` (default for local dev), the API can boot without contract IDs.

### Get Account Balance
`GET /stellar/balance/:address`

### Verify Transaction
`POST /stellar/verify`
```json
{
  "txHash": "a1b2c3d4e5f6..."
}
```

### Check Account Existence
`GET /stellar/account-exists/:address`

### Invoke Soroban Contract (Admin Only)
`POST /stellar/invoke-contract`
```json
{
  "contractId": "CC...",
  "functionName": "anchor_confession",
  "args": ["hash", 1234567890],
  "sourceAccount": "GB..."
}
```

## Usage Example
```typescript
// Get balance
const balance = await stellarService.getAccountBalance('GB...');
// Anchor a confession
await contractService.anchorConfession('hash', Date.now(), 'SC...');
```

## Security Notes
- Never log or expose secret keys
- All secrets must be provided via environment variables
- Input validation and error handling are enforced

## Testing
Run all tests:
```bash
npm run test
npm run test:e2e
```

## Environment Variables
See `.env.example` for all required variables.

## Gotchas & Edge Cases
- Testnet and mainnet configs must be set correctly
- Contract parameter encoding must match Soroban contract ABI
- Network errors are common; always handle exceptions

## TODO
- Optimize contract parameter encoding for complex types
- Add more granular admin guards for contract endpoints
