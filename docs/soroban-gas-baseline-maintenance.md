# Soroban Gas Baseline Maintenance Notes

## Overview
This document outlines the maintenance workflow for Soroban contract gas baselines. Tracking gas usage is critical for identifying performance regressions and maintaining predictable costs on the Stellar network.

## Gas Baseline Storage Location
Gas baselines are stored as snapshots within the `xconfess-contracts/tests/snapshots` directory. These are generated and validated during testing to ensure gas usage remains within expected tolerances.

## Benchmark Update Workflow
When making changes to Soroban contracts, follow this workflow to update benchmarks:

1. **Run simulations**: First, verify that your changes are functionally correct.
2. **Run benchmarks**: Execute the benchmark scripts to measure gas consumption.
3. **Compare results**: The test framework will automatically compare the new gas usage against the baselines.
4. **Update baselines**: If there's a significant but expected change in gas usage, regenerate the baselines and commit them.

## Contract Simulation Commands
To run simulations and generate gas baselines, use the following commands from the `xconfess-contracts` directory:

```bash
# Run cargo tests
cargo test

# Run tests targeting workspace components
cargo test --workspace

# Run benchmarks or scripts (if present)
cargo run --bin benchmark
```

## Regression Review Expectations
When reviewing PRs with benchmark changes:
* **Acceptable Variance**: Minor fluctuations (e.g., < 1-2%) are typically acceptable, as gas can vary slightly.
* **Meaningful Regressions**: Large spikes indicate potential inefficiencies. Reviewers should require justification for significant gas increases.
* **When NOT to update**: Do not blindly update baselines to "fix" a failing test if the gas increase is unexpected. Investigate the cause first.
* **Checklist**:
  - Is the gas increase expected?
  - Have optimizations been considered?
  - Are the new baselines committed?

## References
* [Contract ABI Reference](./contract-abi-reference.md)
* [Contract Event Schemas](./event-schemas.md)
