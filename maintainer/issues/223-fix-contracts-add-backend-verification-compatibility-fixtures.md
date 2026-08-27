# Issue #822: Add Backend Verification Compatibility Fixtures for Contract Events

**Status:** Implementation  
**Priority:** P1  
**Assignee:** Development Team  
**Related Issues:** #170, #173  

## Summary

Create shared compatibility fixtures that prove contract event output still matches what backend verification and reconciliation code expects. These fixtures ensure that contract and backend work can evolve independently without silent drift.

## Problem

Contract and backend work can drift apart quietly unless the repo carries one clear fixture set that ties emitted events to off-chain verification expectations. Without deterministic fixtures:

- Schema changes in contracts may not be caught until production
- Backend verification code may silently fail to parse new event formats
- Error code mappings may become inconsistent
- Upgrade compatibility is not validated automatically

## Solution

Implement deterministic, version-aware compatibility fixtures that:

1. **Contract Side** (`xconfess-contracts/contracts/tests/backend_verification_fixtures.rs`)
   - Define canonical event structures for anchor and tip events
   - Provide test helpers to verify event emission matches expectations
   - Include boundary cases (zero hash, max timestamp, large amounts)
   - Cover error code mappings for backend retry logic

2. **Backend Side** (`xconfess-backend/src/stellar/__tests__/contract-event-fixtures.spec.ts`)
   - Consume contract fixtures to validate event parsing
   - Verify error classification matches contract definitions
   - Test verification workflows using fixture data

3. **Tipping Service** (`xconfess-backend/src/tipping/contract-fixtures.spec.ts`)
   - Validate settlement event processing
   - Test error handling and retry logic
   - Verify reconciliation state transitions

## Scope

### In Scope

- ✅ Confession anchoring event fixtures (ConfessionAnchoredEvent)
- ✅ Anonymous tip settlement event fixtures (SettlementEvent)
- ✅ Error code fixtures for backend retry classification
- ✅ Deterministic test vectors with version markers
- ✅ Contract-side verification helpers
- ✅ Backend-side fixture consumption tests
- ✅ Boundary case coverage (zero hash, max timestamp, large amounts)

### Out of Scope

- Full end-to-end production deployment tests
- Broad redesign of backend verification services
- Performance benchmarking of fixture execution
- Integration with external Stellar networks

## Files Changed

### Contract Tests
- **Created:** `xconfess-contracts/contracts/tests/backend_verification_fixtures.rs`
  - Defines canonical fixtures for anchor and tip events
  - Provides verification helpers for contract tests
  - Includes error code mappings

### Backend Tests
- **Created:** `xconfess-backend/src/stellar/__tests__/contract-event-fixtures.spec.ts`
  - Tests anchor event fixture parsing
  - Tests tip settlement event fixture parsing
  - Validates error code classification
  - Demonstrates verification workflows

- **Created:** `xconfess-backend/src/tipping/contract-fixtures.spec.ts`
  - Tests settlement event processing
  - Validates error handling and retry logic
  - Tests reconciliation workflows
  - Verifies idempotency guarantees

### Documentation
- **Updated:** `docs/stellar-anchor-and-tipping-runbook.md`
  - Added section on fixture-based verification
  - Documented fixture version compatibility
  - Added troubleshooting for fixture drift

## Fixture Definitions

### Anchor Event Fixtures

#### ANCHOR_FIXTURE_BASIC
```rust
hash: [0x42; 32]
timestamp: 1_700_000_000_000
anchor_height: 12345
event_version: 1
```
Basic confession anchoring with deterministic values.

#### ANCHOR_FIXTURE_ZERO_HASH
```rust
hash: [0x00; 32]
timestamp: 1_700_000_000_001
anchor_height: 12346
event_version: 1
```
Boundary case: all-zero hash is valid.

#### ANCHOR_FIXTURE_MAX_TIMESTAMP
```rust
hash: [0xFF; 32]
timestamp: u64::MAX
anchor_height: 99999
event_version: 1
```
Boundary case: maximum timestamp value.

### Tip Settlement Fixtures

#### TIP_FIXTURE_BASIC
```rust
settlement_id: 1
amount: 1_000_000 (1 XLM in stroops)
proof_metadata: "txhash:abc123"
proof_present: true
event_version: 1
```
Basic anonymous tip with proof metadata.

#### TIP_FIXTURE_NO_PROOF
```rust
settlement_id: 2
amount: 500_000 (0.5 XLM)
proof_metadata: ""
proof_present: false
event_version: 1
```
Anonymous tip without proof metadata.

#### TIP_FIXTURE_LARGE_AMOUNT
```rust
settlement_id: 3
amount: 100_000_000_000 (10,000 XLM)
proof_metadata: "txhash:large_tip_xyz"
proof_present: true
event_version: 1
```
Large amount boundary case.

### Error Code Fixtures

| Code | Name | Classification | HTTP Status |
|------|------|-----------------|-------------|
| 6001 | INVALID_TIP_AMOUNT | Terminal | 400 |
| 6002 | METADATA_TOO_LONG | Terminal | 400 |
| 6003 | TOTAL_OVERFLOW | Retryable | 503 |
| 6004 | NONCE_OVERFLOW | Retryable | 503 |
| 6005 | UNAUTHORIZED | Terminal | 403 |
| 6006 | CONTRACT_PAUSED | Retryable | 503 |
| 6007 | RATE_LIMITED | Retryable | 503 |
| 6008 | INVALID_RATE_LIMIT_CONFIG | Terminal | 400 |

## Acceptance Criteria

- ✅ Contract fixtures are defined in `xconfess-contracts/contracts/tests/backend_verification_fixtures.rs`
- ✅ Fixtures cover at least one anchor event path (3 fixtures: basic, zero hash, max timestamp)
- ✅ Fixtures cover at least one tip event path (3 fixtures: basic, no proof, large amount)
- ✅ Error code fixtures are defined with classification and HTTP status
- ✅ Contract tests verify fixture emission matches expectations
- ✅ Backend stellar tests consume and validate anchor fixtures
- ✅ Backend tipping tests consume and validate tip fixtures
- ✅ Fixtures are deterministic (same output on repeated runs)
- ✅ Fixture version is tracked and stable
- ✅ Documentation updated with fixture usage guide

## How to Test

### Run Contract Fixture Tests
```bash
cd xconfess-contracts
cargo test --test backend_verification_fixtures
```

Expected output:
```
test backend_verification_fixtures::tests::anchor_fixture_basic_matches_contract_output ... ok
test backend_verification_fixtures::tests::anchor_fixture_zero_hash_matches_contract_output ... ok
test backend_verification_fixtures::tests::anchor_fixture_max_timestamp_matches_contract_output ... ok
test backend_verification_fixtures::tests::tip_fixture_basic_matches_contract_output ... ok
test backend_verification_fixtures::tests::tip_fixture_no_proof_matches_contract_output ... ok
test backend_verification_fixtures::tests::tip_fixture_large_amount_matches_contract_output ... ok
test backend_verification_fixtures::tests::error_code_fixtures_are_stable ... ok
test backend_verification_fixtures::tests::fixture_version_is_stable ... ok
test backend_verification_fixtures::tests::all_fixtures_are_deterministic ... ok
```

### Run Backend Fixture Tests
```bash
cd xconfess-backend
npm test -- contract-event-fixtures.spec.ts
npm test -- contract-fixtures.spec.ts
```

Expected output:
```
Contract Event Fixtures Compatibility
  Anchor Event Fixtures
    ✓ should parse basic anchor event fixture
    ✓ should handle zero hash anchor event fixture
    ✓ should handle max timestamp anchor event fixture
  Tip Settlement Event Fixtures
    ✓ should parse basic tip settlement event fixture
    ✓ should handle tip settlement without proof fixture
    ✓ should handle large tip amount fixture
  Error Code Fixtures
    ✓ should classify tipping error codes correctly
    ✓ should have stable error code constants
  Event Schema Versioning
    ✓ should handle event version compatibility
    ✓ should maintain fixture version stability
  Backend Verification Integration
    ✓ should demonstrate anchor verification workflow
    ✓ should demonstrate tip verification workflow

Tipping Contract Fixtures
  Settlement Event Processing
    ✓ should process basic tip settlement event
    ✓ should handle tip settlement without proof metadata
    ✓ should handle large tip amounts
  Error Code Handling
    ✓ should classify terminal tipping errors correctly
    ✓ should classify retryable tipping errors correctly
    ✓ should provide appropriate retry delays
  Verification Workflow Compatibility
    ✓ should handle tip verification request format
    ✓ should handle idempotent verification responses
    ✓ should handle stale pending detection
  Reconciliation Worker Compatibility
    ✓ should handle reconciliation state transitions
    ✓ should handle network mismatch scenarios
  Fixture Version Compatibility
    ✓ should maintain fixture version stability
    ✓ should handle event version evolution
```

### Verify Determinism
```bash
# Run contract tests multiple times and verify identical output
cd xconfess-contracts
for i in {1..3}; do cargo test --test backend_verification_fixtures 2>&1 | grep -E "test result|ok"; done
```

All runs should show identical test results.

## Implementation Details

### Fixture Version Tracking

Fixtures include a `FIXTURE_VERSION` constant (currently 1) that must be incremented when:
- Event payload structure changes
- Error code mappings change
- New fixture categories are added

When fixture version changes:
1. Update `FIXTURE_VERSION` constant
2. Add migration logic to handle old versions
3. Document breaking changes in changelog
4. Update backend tests to handle both versions

### Determinism Guarantees

Fixtures are deterministic by design:
- All values are hardcoded constants
- No random number generation
- No timestamp-dependent logic (timestamps are fixed)
- Ledger height is set explicitly in tests

This ensures:
- Same output across multiple runs
- Reproducible results in CI/CD
- Easy comparison with backend expectations

### Error Code Classification

Error codes are classified as:
- **Terminal**: Caller's responsibility to fix (invalid input, auth failure)
- **Retryable**: Transient state (pause, rate limit, overflow)

Backend uses this classification to:
- Determine retry strategy (exponential backoff for retryable)
- Select HTTP status code (503 for retryable, 400/403/409 for terminal)
- Implement circuit breaker logic

## Verification Workflow

### Anchor Verification
1. Contract emits `ConfessionAnchoredEvent` with:
   - `event_version`: Schema discriminator
   - `timestamp`: Client-provided timestamp
   - `anchor_height`: Ledger sequence at anchor time
2. Backend receives event and verifies:
   - Event version matches expected schema
   - Timestamp is within acceptable range
   - Anchor height is valid
3. Backend stores anchor record with status `confirmed`

### Tip Verification
1. Contract emits `SettlementEvent` with:
   - `event_version`: Schema discriminator
   - `settlement_id`: Unique settlement identifier
   - `amount`: Tip amount in stroops
   - `proof_metadata`: Optional proof reference
   - `proof_present`: Boolean flag
2. Backend receives event and verifies:
   - Event version matches expected schema
   - Settlement ID is unique (idempotency check)
   - Amount is positive and within limits
   - Proof metadata format is valid
3. Backend stores tip record with status `confirmed`

## Troubleshooting

### Fixture Drift Detection

If backend tests fail with fixture mismatches:

1. **Check event version**
   ```
   Expected event_version: 1, got: 2
   ```
   → Contract event schema changed; update backend parser

2. **Check field values**
   ```
   Expected timestamp: 1700000000000, got: 1700000000001
   ```
   → Fixture constant changed; verify intentional change

3. **Check error codes**
   ```
   Expected error code 6001, got: 6002
   ```
   → Error code mapping changed; update backend classification

### Running Fixtures in Isolation

```bash
# Contract: run single fixture test
cd xconfess-contracts
cargo test --test backend_verification_fixtures anchor_fixture_basic

# Backend: run single fixture test
cd xconfess-backend
npm test -- contract-event-fixtures.spec.ts -t "should parse basic anchor"
```

## Related Documentation

- `docs/stellar-anchor-and-tipping-runbook.md` - Operational workflows
- `maintainer/issues/170-fix-backend-tip-verification-idempotency-replay.md` - Idempotency design
- `maintainer/issues/173-feat-backend-chain-reconciliation-worker.md` - Reconciliation worker

## Future Enhancements

1. **Export Fixtures as JSON**
   - Generate JSON representation of fixtures for cross-language consumers
   - Enable fixture consumption by non-Rust/TypeScript services

2. **Fixture Versioning Strategy**
   - Document upgrade path for fixture version changes
   - Implement fixture migration helpers

3. **Extended Coverage**
   - Add fixtures for governance events
   - Add fixtures for badge events
   - Add fixtures for role events

4. **Performance Baselines**
   - Capture event parsing performance with fixtures
   - Track performance regression across versions

## Sign-Off

- [ ] Contract fixtures implemented and tested
- [ ] Backend stellar tests implemented and passing
- [ ] Backend tipping tests implemented and passing
- [ ] Documentation updated
- [ ] All acceptance criteria met
- [ ] Code review completed
- [ ] Ready for merge
