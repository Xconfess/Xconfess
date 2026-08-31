# Soroban Gas Baseline Maintenance Notes

## Overview
This document outlines the maintenance workflow for Soroban contract gas baselines. Tracking gas usage is critical for identifying performance regressions and maintaining predictable costs on the Stellar network.

## Gas Baseline Storage Location
Gas baselines are stored in `xconfess-contracts/gas-baseline.json`. This file contains CPU and memory metrics for key functions across all four contract crates:

```
confession-anchor:   anchor_confession, verify_confession
anonymous-tipping:   get_tips, send_tip
confession-registry: create_confession, update_status
reputation-badges:   get_badges, mint_badge
```

## Quick Reference

| Task | Command |
|------|---------|
| Run all contract tests | `npm run contract:test` |
| Run benchmarks only | `./scripts/contracts-gas-checks.sh` |
| Update baseline after changes | `./scripts/contracts-gas-checks.sh --update` |
| Generate gas snapshot | `cd xconfess-contracts && ./contracts/scripts/gas-snapshot.sh` |
| Compare against baseline | `cd xconfess-contracts && ./contracts/scripts/gas-compare.sh` |

All commands run from the **monorepo root** unless noted otherwise.

## Gas Snapshot Workflow

### 1. Verify your changes are correct
```bash
npm run contract:test
```

### 2. Run the gas regression check
```bash
./scripts/contracts-gas-checks.sh
```

This script:
- Benchmarks all four contract crates
- Extracts `GAS_METRIC` lines from test output
- Compares against `gas-baseline.json` with a **5% regression threshold**
- Exits with failure if regressions exceed the threshold

**Expected output (passing):**
```
========================================
  Benchmarking confession-anchor
========================================
  anchor_confession: CPU=28762, MEM=3326
  verify_confession: CPU=24278, MEM=3020
...
========================================
Comparing against baseline...
[OK] confession-anchor::anchor_confession cpu: 28762 (baseline: 28762)
[OK] confession-anchor::anchor_confession mem: 3326 (baseline: 3326)
...
Gas check passed!
```

### 3. If gas changed as expected, update the baseline
```bash
./scripts/contracts-gas-checks.sh --update
```

This regenerates `gas-baseline.json` with the new values. Commit the updated file with your changes.

### 4. Alternative: contract-level gas snapshot
```bash
cd xconfess-contracts
./contracts/scripts/gas-snapshot.sh
```

This runs `cargo test snapshot_gas_usage` to generate per-function gas snapshots.

### 5. Compare against baseline (contract-level)
```bash
cd xconfess-contracts
./contracts/scripts/gas-compare.sh
```

Reads `gas-baseline.json` and `gas-current.json`, reports per-function diffs. Default threshold is 5%; override with `GAS_THRESHOLD=2`.

## Regression Review Expectations
When reviewing PRs with benchmark changes:
* **Acceptable Variance**: Minor fluctuations (e.g., < 1-2%) are typically acceptable, as gas can vary slightly between runs.
* **Meaningful Regressions**: Large spikes indicate potential inefficiencies. Reviewers should require justification for significant gas increases.
* **When NOT to update**: Do not blindly update baselines to "fix" a failing test if the gas increase is unexpected. Investigate the cause first.

## PR Checklist for Gas Changes
- [ ] Is the gas increase expected and documented in the PR description?
- [ ] Have optimizations been considered?
- [ ] Did `./scripts/contracts-gas-checks.sh` pass (or baseline updated)?
- [ ] Is the updated `gas-baseline.json` committed?

## References
* [Contract ABI Reference](./contract-abi-reference.md)
* [Contract Event Schemas](./event-schemas.md)
