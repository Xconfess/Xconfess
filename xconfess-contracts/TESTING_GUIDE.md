# Contract Testing Guide

This guide documents the test suites added for contract robustness and release validation.

## Gas Regression Testing (#2214)

**File**: `contracts/tests/gas_regression.rs`

### Purpose
Track resource usage for anchor, verify, and count operations, ensuring gas costs remain stable and within documented tolerances.

### Test Cases

- **`test_gas_anchor_operations_baseline`**: Establishes baseline gas costs for anchor operations
- **`test_gas_regression_anchor_repeated_calls`**: Verifies consistent gas cost across repeated calls (±5% variance)
- **`test_gas_regression_verify_increasing_load`**: Ensures cost scales linearly with input size (no quadratic blowup)
- **`test_gas_regression_count_large_dataset`**: Records gas cost for large dataset operations
- **`test_gas_operations_documented_limits`**: Verifies operations stay within documented CPU budget limits

### Running Tests
```bash
cd xconfess-contracts
cargo test gas_regression
```

### Acceptance Criteria
- Gas costs remain stable across Soroban releases
- Cost increases are proportional to input size (no algorithmic regressions)
- Operations respect documented tolerances (default ±5%)

---

## Release Script Validation (#2213)

**File**: `scripts/__tests__/contracts-release.test.sh`

### Purpose
Verify that release scripts fail early and clearly when expected WASM artifacts are missing, preventing incomplete deployments.

### Test Cases

- **`test_missing_wasm_artifacts`**: Verify script exits non-zero when any artifact is missing
- **`test_missing_artifact_error_message`**: Confirm error message identifies specific missing files
- **`test_missing_artifact_build_hint`**: Verify build command guidance is provided
- **`test_all_contracts_verified`**: Ensure all four contracts are checked

### Running Tests
```bash
cd scripts/__tests__
bash contracts-release.test.sh
```

### Acceptance Criteria
- Script returns non-zero exit code on missing artifacts
- Error messages identify expected paths
- Build command is documented in error output
- All four contracts are validated: `confession-anchor`, `confession-registry`, `anonymous-tipping`, `reputation-badges`

---

## Anonymous Tipping Authorization Tests (#2206)

**File**: `contracts/anonymous-tipping/tests/test_authorization.rs`

### Purpose
Verify intended caller and balance semantics for tipping methods, ensuring malformed amounts and invalid accounts are handled correctly.

### Test Cases

- **`test_send_tip_with_zero_amount_fails`**: Reject zero-amount tips
- **`test_send_tip_with_negative_amount_fails`**: Reject negative amounts (underflow protection)
- **`test_send_tip_exceeding_max_fails`**: Reject amounts > 10,000 XLM
- **`test_send_tip_without_sender_auth_fails`**: Enforce sender authorization
- **`test_recipient_balance_unchanged_on_failed_tip`**: Verify atomicity on failure
- **`test_metadata_exceeding_max_length_fails`**: Enforce metadata bounds (128 bytes)
- **`test_rate_limit_blocks_excess_tips`**: Verify rate limiting enforcement
- **`test_contract_paused_blocks_all_tips`**: Verify pause blocks operations
- **`test_settlement_receipt_prevents_replay`**: Verify settlement ID reuse detection
- **`test_anonymity_assumption_preserved`**: Confirm sender anonymity in events

### Running Tests
```bash
cd xconfess-contracts/contracts/anonymous-tipping
cargo test test_authorization
```

### Acceptance Criteria
- Malformed amounts (zero, negative, oversized) are rejected
- Invalid accounts are caught
- Failed operations do not alter balances
- Authorization failures prevent token transfer
- Settlement receipts enable cross-contract verification
- Sender identity is not leaked in events

---

## Storage Key Namespace Separation Tests (#2212)

**File**: `contracts/tests/storage_namespace_tests.rs`

### Purpose
Ensure different contract data domains cannot collide in storage keys, preserving deployed storage compatibility.

### Test Cases

- **`test_storage_key_namespace_isolation`**: Verify domains do not cross-contaminate
- **`test_storage_key_prefix_uniqueness`**: Confirm each domain has unique prefix
- **`test_independent_state_updates`**: Verify updates to one domain don't affect others
- **`test_deployed_storage_compatibility`**: Ensure v1/v2 keys coexist safely
- **`test_namespace_collision_prevention`**: Verify similar key names don't collide
- **`test_persistent_vs_instance_storage_isolation`**: Confirm storage layers are separate
- **`test_concurrent_domain_operations`**: Verify domain isolation under interleaved access
- **`test_storage_key_length_does_not_collide`**: Verify keys of different lengths don't collide

### Running Tests
```bash
cd xconfess-contracts
cargo test storage_namespace
```

### Acceptance Criteria
- Keys from different domains never return cross-domain data
- Key prefixes are documented
- Storage format is backwards-compatible with deployed v1 contracts
- Similar key names do not collide
- Instance and persistent storage layers are isolated

---

## Running All Tests

```bash
cd xconfess-contracts
cargo test --all
```

## Documentation Updates

All test suites are integrated with existing CI/CD pipelines:
- Contract tests run on every PR via GitHub Actions
- Release script tests validate deployment readiness
- Gas regression tests track performance regressions
- Authorization tests enforce security invariants
- Storage tests prevent data corruption

---

## Contact

For issues or questions about these tests, refer to:
- Gas regression: `gas-baseline.json` for tolerance thresholds
- Release validation: `scripts/contracts-release.sh` for build requirements
- Authorization: Contract documentation for safety assumptions
- Storage: `CONTRACT_LIFECYCLE.md` for deployment compatibility notes
