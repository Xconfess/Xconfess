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

## RPC Rate Limits

Issue #2279. When Horizon or Soroban RPC throttles a call (HTTP 429), the backend backs off instead of retrying immediately (`utils/rpc-rate-limit.ts`). This applies to `getAccountBalance`, `verifyTransaction`, `verifyTransactionFull`, `verifyConfession` and `submitTransaction`.

- **Retry hints are honored:** a `Retry-After` header (seconds or HTTP date) sets the wait before the next attempt.
- **Without a hint:** exponential backoff, `STELLAR_RPC_RETRY_BASE_DELAY_MS * 2^attempt`.
- **Bounded:** at most `STELLAR_RPC_MAX_RETRIES` retries, and no single wait longer than `STELLAR_RPC_RETRY_MAX_DELAY_MS`. If the provider asks for a longer wait, the call fails fast rather than blocking.
- **Safe response:** when retrying stops, the API returns `503 Service Unavailable` with a `Retry-After` header:

  ```json
  {
    "status": 503,
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service temporarily unavailable. Please retry later.",
    "retryAfter": 30
  }
  ```

  The message is fixed. Provider responses, URLs, API keys and request data are never included. Logs record only the operation name, attempt count and delay.
- A throttled call is never reported as a result. `verifyTransaction` no longer returns `false`, `verifyConfession` no longer returns `null`, and `getAccountBalance` no longer returns "not found". Callers get the 503 instead. Tip verification already treats this as retryable.

## Gotchas & Edge Cases
- Testnet and mainnet configs must be set correctly
- Contract parameter encoding must match Soroban contract ABI
- Network errors are common; always handle exceptions

## TODO
- Optimize contract parameter encoding for complex types
- Add more granular admin guards for contract endpoints
