# xconfess-contracts

Soroban smart contract for the XConfess platform. Provides tamper-proof
on-chain anchoring of anonymous confession hashes on the Stellar network.

---

## Table of contents

- [What's contract does](#what-the-contract-does)
- [Prerequisites](#prerequisites)
- [Toolchain setup](#toolchain-setup)
- [Project structure](#project-structure)
- [Building](#building)
- [Testing](#testing)
- [Linting and formatting](#linting-and-formatting)
- [Deployment](#deployment)
- [Versioning policy](#versioning-policy)
- [Contract API](#contract-api)
- [Administration](#administration)
- [Architecture notes](#architecture-notes)
- [Threat model](#threat-model)
- [Troubleshooting](#troubleshooting)

---

## What the contract does

`ConfessionAnchor` stores a 32-byte hash of each confession alongside the
client-supplied timestamp and the Stellar ledger sequence number at the time
of anchoring. It enforces uniqueness: the same hash can only be anchored
once. Off-chain content is never stored on-chain — only the hash.

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Rust (stable) | 1.81 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| `wasm32-unknown-unknown` target | — | `rustup target add wasm32-unknown-unknown` |
| `stellar` CLI (Stellar CLI) | 22.0.0 | See [Stellar CLI docs](https://developers.stellar.org/docs/smart-contracts/getting-started/setup) |
| Node.js | 18.0.0 | [nodejs.org](https://nodejs.org) |
| npm | 9.0.0 | Bundled with Node 18+ |

> **Note:** The `stellar` CLI was previously called `soroban`. All commands
> below use the current `stellar contract ...` form. If you have an older
> install run `stellar --version` and upgrade if it reports < 22.0.0.

---

## Toolchain setup

Run this once on a fresh machine. All commands are idempotent.

```bash
# 1. Install Rust (skip if already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# 2. Add the Soroban WASM compilation target
rustup target add wasm32-unknown-unknown

# 3. Install the Stellar CLI
cargo install --locked stellar-cli --version 22.0.0 --features opt

# 4. Verify the toolchain
rustc --version          # expect: rustc 1.81.x or later
stellar --version        # expect: stellar 22.0.0
```

After installing, return to the **monorepo root** and run:

```bash
npm install
```

npm workspaces will resolve `xconfess-backend` and `xconfess-contracts`
together. The contract workspace has no npm dependencies of its own —
`npm install` is a no-op for it, but the presence of `package.json` lets
npm scripts at the root delegate to it uniformly.

---

## Project structure

```
xconfess-contracts/
├── Cargo.toml                          # Rust package manifest and build profile
├── package.json                        # npm shim — delegates all scripts to cargo
├── README.md                           # This file
├── rust-toolchain.toml                 # Pins Rust stable channel for CI reproducibility
├── src/
│   ├── lib.rs                          # ConfessionAnchor contract entry point
│   └── access_control.rs              # Role management module (owner / admin)
└── test/
    ├── access_control.rs               # Role guard and event tests
    └── integration/
        └── confession_moderation.rs    # Full lifecycle integration tests
```

---

## Building

### Canonical reproducible flow (recommended)

From the monorepo root, use one script for all contract crates:

```bash
./scripts/contracts-release.sh build
```

This command:

- builds every workspace contract crate in release mode with `--locked`
- targets `wasm32-unknown-unknown` consistently
- verifies all expected `.wasm` outputs exist
- writes `deployments/contract-wasm-manifest.json` with SHA-256 hashes

### Development build (fast, unoptimised)

```bash
# From monorepo root
npm run contract:build

# From xconfess-contracts/ directly
cargo build --target wasm32-unknown-unknown
```

### Release build (optimised WASM for deployment)

```bash
# From monorepo root
npm run contract:build:release

# From xconfess-contracts/ directly
cargo build --release --target wasm32-unknown-unknown
```

The release WASM is written to:

```
xconfess-contracts/target/wasm32-unknown-unknown/release/confession_anchor.wasm
```

### Optimise WASM binary (optional — reduces upload fees)

After a release build, run the Stellar CLI optimiser to strip unused sections:

```bash
npm run optimize --workspace=xconfess-contracts
# or:
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/confession_anchor.wasm
```

The optimised file is written next to the original with an `.optimized.wasm`
suffix.

---

## Testing

### All tests (unit + integration)

```bash
# From monorepo root
npm run contract:test

# From xconfess-contracts/ directly
cargo test
```

**Expected output (clean run):**

```
running 23 tests in src/lib.rs
test anchor_and_verify_confession ... ok
test anchor_height_is_recorded_from_ledger_sequence ... ok
...
test result: ok. 23 passed; 0 failed; 0 ignored
```

### Integration tests only

```bash
# From monorepo root
npm run contract:test:integration

# From xconfess-contracts/ directly
cargo test --test confession_moderation
cargo test --test access_control
```

### Tests with output (useful for gas figures)

```bash
npm run test:verbose --workspace=xconfess-contracts
# or:
cargo test -- --nocapture
```

### Code coverage (optional — requires cargo-tarpaulin)

```bash
# Install once
cargo install cargo-tarpaulin

# Run
npm run test:coverage --workspace=xconfess-contracts
# Coverage report written to xconfess-contracts/coverage/lcov.info
```

---

## Linting and formatting

```bash
# Lint (all warnings treated as errors — mirrors CI)
npm run contract:lint

# Format code in-place
npm run contract:fmt

# Check formatting without modifying files (used in CI)
npm run contract:fmt:check
```

Clippy rules are inherited from the workspace default. No `#[allow(...)]`
attributes are used in contract code; all lints must be resolved.

---

## Deployment

### Canonical deployment flow (recommended)

Use the same script used for reproducible builds:

```bash
# 1) Build and generate deterministic artifact manifest
./scripts/contracts-release.sh build

# 2) Deploy all contract crates to a network with one command
./scripts/contracts-release.sh deploy --network testnet --source my-deployer-key
```

The deploy step writes network metadata to `deployments/<network>.json`, including:

- deployed contract IDs
- source key alias used for deployment
- crate versions
- wasm SHA-256 hashes

See [`deployments/README.md`](../deployments/README.md) for the deployment
metadata naming convention, commit policy, and redacted example. See
[`docs/contract-release-and-upgrade-runbook.md`](../docs/contract-release-and-upgrade-runbook.md)
for checksum review and post-deployment verification.

### Prerequisites for deployment

1. Generate or import a Stellar keypair:

```bash
stellar keys generate --global my-deployer-key --network testnet
stellar keys address my-deployer-key
```

2. Fund the account on testnet via Friendbot:

```bash
stellar network fund my-deployer-key --network testnet
```

### Deploy to testnet

```bash
# Build + deploy all crates
./scripts/contracts-release.sh build
./scripts/contracts-release.sh deploy --network testnet --source my-deployer-key
```

Or directly:

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/confession_anchor.wasm \
  --network testnet \
  --source my-deployer-key
```

The command prints the deployed contract ID. Save it in `xconfess-backend/.env`:

```env
CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
```

### Deploy to mainnet

Mainnet deployment is allowed only after the same commit has been deployed and
verified on testnet. Before running this command, complete the mainnet safety
gate in
[`docs/contract-release-and-upgrade-runbook.md`](../docs/contract-release-and-upgrade-runbook.md#mainnet-safety-gate)
and record approvals from platform, security, and release owners.

```bash
./scripts/contracts-release.sh deploy --network public --source my-mainnet-key
```

> **Warning:** Mainnet deployments are permanent and incur real XLM fees.
> Keep the previous `deployments/<network>.json` ready for rollback, and use
> [`docs/contract-signer-rotation-runbook.md`](../docs/contract-signer-rotation-runbook.md)
> for contracts with pause controls.

---

## Versioning policy

Contract versioning rules are documented in [`VERSIONING.md`](./VERSIONING.md).

Release and deployment automation rely on that policy by recording each crate
version alongside the built artifact hash in `deployments/contract-wasm-manifest.json`
and in `deployments/<network>.json`.

## Contract API

### `anchor_confession(hash: BytesN<32>, timestamp: u64) → Symbol`

| Return value | Meaning |
|---|---|
| `"anchored"` | Hash stored for the first time |
| `"exists"` | Hash was already anchored; no state changed |

Emits event: `topics = ("confession_anchor", hash)`, `data = (timestamp, anchor_height)`.

### `verify_confession(hash: BytesN<32>) → Option<u64>`

Returns `Some(timestamp)` if the hash is anchored, `None` otherwise.

### `get_confession_count() → u64`

Returns the total number of unique hashes ever anchored.

### `get_version() → ContractVersionInfo`

Returns release metadata for compatibility checks:

- `major: u32`
- `minor: u32`
- `patch: u32`
- `build_metadata: String`

### `get_capabilities() → ContractCapabilityInfo`

Returns runtime capability flags plus compatibility markers:

- `capabilities: Vec<Symbol>`
- `event_schema_version: u32`
- `error_registry_version: u32`

Current flags:

- `anchorv1`
- `verifyv1`
- `countv1`
- `eventsv1`
- `meta_v1`

### `has_capability(capability: Symbol) → bool`

Utility read method so off-chain consumers can branch behavior safely.

### `get_event_schema_version() → u32`
### `get_error_registry_version() → u32`

Compatibility markers for event payload schema and error-code registry versions.

---

## Administration

For comprehensive contract administration guidance, see:

- **[Contract Lifecycle Guide](./CONTRACT_LIFECYCLE.md)** - Complete lifecycle management, initialization procedures, and security considerations
- **[Administration Guide](./ADMIN_GUIDE.md)** - Practical operational procedures, monitoring, and troubleshooting
- **[ReputationBadges Model](./REPUTATION_BADGES_MODEL.md)** - Detailed authorization model, badge system, and reputation tracking (ReputationBadges contract)

### Quick Admin Reference

```bash
# Check contract status
stellar contract info --id $CONTRACT_ID --network $NETWORK

# Get current administrator
stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- get_admin

# Transfer administrator rights
stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- transfer_admin --new_admin $NEW_ADMIN_ADDRESS
```

### Contract-Specific Admin

| Contract | Admin Functions | Documentation |
|----------|----------------|---------------|
| ConfessionAnchor | initialize, transfer_owner, grant_admin, revoke_admin, pause, unpause | [Lifecycle Guide](./CONTRACT_LIFECYCLE.md#confessionanchor-contract), [Admin Guide](./ADMIN_GUIDE.md#confessionanchor-contract) |
| ReputationBadges | initialize, transfer_admin, create_badge, award_badge, adjust_reputation | [Lifecycle Guide](./CONTRACT_LIFECYCLE.md#reputationbadges-contract), [Model Guide](./REPUTATION_BADGES_MODEL.md) |
| AnonymousTipping | None (decentralized) | [Lifecycle Guide](./CONTRACT_LIFECYCLE.md#anonymoustipping-contract) |

---

## Architecture notes

**No content on-chain.** Only a SHA-256 (or equivalent 32-byte) hash is
stored. The full confession text lives in the Postgres database managed by
`xconfess-backend`. The hash provides a tamper-evident anchor: if the
backend content is altered the hash will no longer match the chain record.

**Instance storage for all data.** All keys (`count`, confession hashes,
owner, admin set) use `env.storage().instance()`. Instance storage is
renewed automatically as long as the contract is active, avoiding manual
TTL extension in the current protocol version.

**`cdylib` + `rlib` dual crate type.** `cdylib` produces the WASM binary
for deployment. `rlib` allows integration tests (which live under `test/`
and are compiled as separate crates by cargo) to `use xconfess_contract::*`
without a separate package.

**Error codes are numeric `u32` constants.** Panic messages in privileged
functions encode the `AccessError` discriminant as a string (e.g. `"2"` for
`NotAuthorized`). This lets the NestJS backend and tests match on stable
codes without parsing message text.

---

## Threat model

For a detailed analysis of our security assumptions, privileged roles, trust boundaries, and specific threat mitigations, please read the [Threat Model and Security Assumptions](../docs/contract-threat-model.md) document.

---

## Troubleshooting

### `error[E0463]: can't find crate for 'std'`

The contract uses `#![no_std]`. You are likely compiling for the host
target instead of WASM. Always pass `--target wasm32-unknown-unknown`:

```bash
cargo build --target wasm32-unknown-unknown
```

### `stellar: command not found`

Install or update the Stellar CLI:

```bash
cargo install --locked stellar-cli --version 22.0.0 --features opt
```

Ensure `~/.cargo/bin` is on your `PATH`.

### `error: linker 'cc' not found` (Linux)

Install the C linker:

```bash
sudo apt-get install build-essential   # Debian/Ubuntu
sudo dnf install gcc                   # Fedora/RHEL
```

### Tests fail with `attempt to subtract with overflow`

Dev and release profiles both have `overflow-checks = true`. This is
intentional — fix the overflow rather than disabling the check.

### `npm run contract:test` exits with `cargo not found`

npm delegates to cargo via shell. Ensure `~/.cargo/bin` is in the `PATH`
for the shell session that runs npm scripts. Add to `~/.bashrc` or
`~/.zshrc`:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```
