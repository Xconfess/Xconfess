# Contract Release and Upgrade Runbook

This is the canonical runbook for planning, building, deploying, and upgrading xConfess smart contracts to Stellar networks.

**Key principle:** All contract releases follow a single deterministic flow using `./scripts/contracts-release.sh`. Never manually invoke `stellar contract deploy` or `cargo build` outside this script.

---

## Table of Contents

- [Overview](#overview)
- [Pre-Release Checklist](#pre-release-checklist)
- [Toolchain Verification](#toolchain-verification)
- [Build Phase](#build-phase)
- [Artifact Checksum Review](#artifact-checksum-review)
- [Deployment Phase](#deployment-phase)
- [Post-Deployment Verification](#post-deployment-verification)
- [Contract Reference](#contract-reference)
- [Storage Migration Testing](#storage-migration-testing)
- [Upgrade and Rollback](#upgrade-and-rollback)
- [Troubleshooting](#troubleshooting)

---

## Overview

### Contracts in Active Release

The xconfess-contracts workspace contains four contracts deployed as a unit:

| Contract | Crate | Purpose | Deployed | Upgradeable |
|----------|-------|---------|----------|-------------|
| **ConfessionAnchor** | `confession-anchor` | Tamper-proof hash anchoring on-chain | Yes | No (immutable once deployed) |
| **ConfessionRegistry** | `confession-registry` | Registry and lifecycle management of confessions with governance | Yes | Limited (governance controls) |
| **ReputationBadges** | `reputation-badges` | User badges and reputation tracking | Yes | No (badge types are fixed) |
| **AnonymousTipping** | `anonymous-tipping` | Anonymous tip distribution and settlement tracking | Yes | No (settlement logic is fixed) |

All four contracts are built and deployed together in a single release window. They share a common `Cargo.lock` snapshot for reproducibility.

### Network Support

- **Testnet**: Uses Stellar testnet (https://horizon-testnet.stellar.org)
- **Futurenet**: Uses Stellar futurenet (https://horizon-futurenet.stellar.org)
- **Public/Mainnet**: Uses Stellar public network (https://horizon.stellar.org)

---

## Pre-Release Checklist

Before beginning a contract release or upgrade:

**Code Readiness**
- [ ] All contract source changes reviewed and approved in pull request
- [ ] Security review completed for any contract API or storage changes
- [ ] Contract versioning updated in `xconfess-contracts/contracts/*/Cargo.toml` according to [VERSIONING.md](../xconfess-contracts/VERSIONING.md)
- [ ] `xconfess-contracts/Cargo.lock` committed and reflects final dependency state
- [ ] All Rust lints pass locally: `cargo clippy --all-targets --all-features`

**Infrastructure Readiness**
- [ ] Testnet deployer account is funded with sufficient XLM for all deployments
- [ ] Production/Mainnet deployer account exists and is properly secured (only if moving to mainnet)
- [ ] Backend and frontend teams confirmed they can consume new contract IDs if contract addresses change
- [ ] Required environment variables prepared for the target network
- [ ] Network status verified at https://status.stellar.org
- [ ] Rollback plan defined (what will you do if deployment fails)

**Documentation**
- [ ] Release notes drafted with contract version changes and compatibility notes
- [ ] Any new contract functions documented for downstream consumers
- [ ] Breaking changes (if any) flagged with migration guidance

---

## Toolchain Verification

Ensure your local environment is ready for building and deploying.

### Required Versions

| Tool | Minimum | Current Spec |
|------|---------|--------------|
| **Rust** (stable) | 1.81 | Use `rustc --version` |
| **Cargo** | — | Comes with Rust |
| **wasm32-unknown-unknown** target | — | Install via `rustup target add wasm32-unknown-unknown` |
| **Stellar CLI** | 22.0.0 | Check version carefully; older `soroban` CLI is deprecated |
| **Node.js** | 18.0.0 | For npm scripts in workspace |
| **Python 3** | 3.7+ | Used by build manifest generation script |

### Verification Script

Run this before any release:

```bash
#!/usr/bin/env bash

echo "=== Toolchain Verification ==="
echo

echo "Rust version:"
rustc --version

echo
echo "Cargo version:"
cargo --version

echo
echo "Stellar CLI version (must be 22.0.0 or later):"
stellar --version

echo
echo "Node.js version:"
node --version

echo
echo "WASM target installed:"
rustup target list | grep wasm32-unknown-unknown

echo
echo "Python version:"
python3 --version

echo
echo "=== Toolchain Ready ===" 
```

### Upgrade Toolchain If Needed

```bash
# Upgrade Rust to latest stable
rustup update stable

# Add WASM target (idempotent)
rustup target add wasm32-unknown-unknown

# Upgrade Stellar CLI to 22.0.0
cargo install --locked stellar-cli --version 22.0.0 --features opt

# Verify installed version
stellar --version  # Should report: stellar 22.0.0
```

---

## Build Phase

### Step 1: Prepare the Environment

From the repository root:

```bash
# Navigate to repo root (if not already)
cd "$(git rev-parse --show-toplevel)"

# Verify you are on the correct branch with the intended changes
git branch -v
git log --oneline -5

# Confirm all changes are committed (no dirty working tree)
git status

# Double-check Cargo.lock reflects the final state
git show HEAD:xconfess-contracts/Cargo.lock | head -20
```

### Step 2: Run the Build

```bash
# From repository root, run the canonical build script
./scripts/contracts-release.sh build
```

**What this does:**
1. Verifies `cargo` and `rustup` are available
2. Adds the WASM target if missing (idempotent)
3. Builds all four contracts using `cargo build --locked --workspace --release --target wasm32-unknown-unknown`
4. Generates `deployments/contract-wasm-manifest.json` with SHA-256 hashes and version metadata
5. Returns exit code 0 on success

**Expected output:**

```
[build output omitted]
Build complete. Manifest: ./deployments/contract-wasm-manifest.json
```

### Step 3: Verify Build Artifacts

```bash
# Check the manifest was generated
cat deployments/contract-wasm-manifest.json | jq .

# Verify all four WASM files exist
ls -lh xconfess-contracts/target/wasm32-unknown-unknown/release/*.wasm

# Expected files:
#   confession_anchor.wasm
#   confession_registry.wasm
#   reputation_badges.wasm
#   anonymous_tipping.wasm

# Record the manifest SHA-256 hashes for later verification
jq '.contracts | keys' deployments/contract-wasm-manifest.json
```

### Step 4: Commit Build Metadata (if applicable)

For release branches or snapshots, you may want to commit the manifest:

```bash
git add deployments/contract-wasm-manifest.json
git commit -m "build: contract release manifest for version X.Y.Z"
```

---

## Artifact Checksum Review

`./scripts/contracts-release.sh build` and `./scripts/contracts-release.sh deploy`
both generate SHA-256 metadata from the release WASM files. The hash is written
to:

- `deployments/contract-wasm-manifest.json` before deployment
- `deployments/<network>.json` after deployment

The hashes are generated inside `scripts/contracts-release.sh` by reading each
built WASM artifact and computing `hashlib.sha256(content).hexdigest()`.

Run `./scripts/test-contract-release-metadata.sh` when changing the deployment
metadata shape. If fields move or are renamed, update that test's manifest
assertions at the same time so missing artifacts and missing `sha256` values
continue to fail with a clear contract name.

### Recompute A Hash Locally

Run the release build first so the manifest and WASM files are from the same
source tree:

```bash
./scripts/contracts-release.sh build
```

Then recompute and compare one artifact hash:

```bash
export CONTRACT="confession-anchor"
export WASM_PATH="$(jq -r --arg contract "$CONTRACT" '.contracts[$contract].wasm_file' deployments/contract-wasm-manifest.json)"
export MANIFEST_SHA="$(jq -r --arg contract "$CONTRACT" '.contracts[$contract].sha256' deployments/contract-wasm-manifest.json)"

sha256sum "xconfess-contracts/$WASM_PATH"
printf 'manifest: %s\n' "$MANIFEST_SHA"
```

For macOS maintainers without `sha256sum`, use:

```bash
shasum -a 256 "xconfess-contracts/$WASM_PATH"
```

To verify every contract in the manifest:

```bash
jq -r '.contracts | to_entries[] | [.key, .value.wasm_file, .value.sha256] | @tsv' deployments/contract-wasm-manifest.json |
while IFS=$'\t' read -r contract wasm_path expected_sha; do
  actual_sha="$(sha256sum "xconfess-contracts/$wasm_path" | awk '{print $1}')"
  test "$actual_sha" = "$expected_sha"
  printf '%s %s\n' "$contract" "$actual_sha"
done
```

### PR Review Checklist For Hash Changes

- Confirm the PR includes source, dependency, compiler, or build-script changes
  that explain every changed WASM hash.
- Confirm `xconfess-contracts/contracts/*/Cargo.toml` versions changed when the
  contract behavior or storage compatibility changed.
- Re-run `./scripts/contracts-release.sh build` locally and compare the
  regenerated `deployments/contract-wasm-manifest.json`.
- Confirm no private key material, Stellar secret key, or local CLI account name
  was added to deployment metadata.
- Treat an unexplained hash-only diff as a release blocker until the artifact is
  rebuilt from reviewed source.

---

## Deployment Phase

### Step 1: Configure the Target Network

Before deploying, ensure the Stellar CLI has the target network configured:

```bash
# For Testnet (example)
stellar network add-remote testnet https://horizon-testnet.stellar.org
stellar network use testnet
stellar network list
```

**Common networks:**

```bash
# Testnet
stellar network add-remote testnet https://horizon-testnet.stellar.org

# Futurenet
stellar network add-remote futurenet https://horizon-futurenet.stellar.org

# Public/Mainnet
stellar network add-remote public https://horizon.stellar.org
```

### Mainnet Safety Gate

Do not deploy to mainnet until the same commit has completed a clean testnet
release.

Required before any mainnet deployment:

- Testnet deployment metadata is committed at `deployments/testnet.json`.
- The [post-deployment verification checklist](#post-deployment-verification)
  passed on testnet for all four contracts.
- `deployments/contract-wasm-manifest.json` hashes match the WASM artifacts
  promoted to mainnet.
- Platform, security, and release owners approved the release in the PR or
  release ticket.
- Backend and frontend configuration changes for new contract IDs are prepared
  and reviewed.
- The rollback owner, pause owner, and release communication channel are named
  in the release notes.

Mainnet deployment command, after approvals:

```bash
./scripts/contracts-release.sh deploy --network public --source "$MAINNET_DEPLOYER_KEY"
```

Use the exact network alias configured in Stellar CLI. If the local alias is
`mainnet` instead of `public`, record that alias in the release notes before
deploying.

### Step 2: Ensure Deployer Account is Funded

```bash
# Check account balance on testnet (example)
export DEPLOYER_KEY="your-named-key"
stellar keys show "$DEPLOYER_KEY"

# Fund the account:
# - Testnet: Use faucet at https://laboratory.stellar.org/#account-creator?network=testnet
# - Mainnet: Transfer XLM from your holdings
# Recommended minimum: 2 XLM (for transaction fees across all four contracts)
```

### Step 3: Deploy All Contracts

```bash
# Run the canonical deploy script
# Arguments: network (testnet/futurenet/public) and source key name
./scripts/contracts-release.sh deploy --network testnet --source "$DEPLOYER_KEY"
```

Replace:
- `testnet` with the target network (futurenet, public, etc.)
- `"$DEPLOYER_KEY"` with the name of the Stellar CLI key to use for signing

**What this does:**
1. Verifies the WASM artifacts exist and match the manifest
2. Deploys each contract in sequence using `stellar contract deploy`
3. Records each returned contract ID
4. Writes deployment metadata to `deployments/testnet.json` (or `<network>.json`)
5. Returns exit code 0 on success

### Deployment metadata format

The canonical deploy script writes a JSON file with these top-level fields:

- `generated_at_utc` — UTC timestamp when the deployment metadata file was created
- `network` — network name passed to `--network`
- `target` — compilation target used for the deployed WASM artifacts
- `contracts` — object keyed by contract crate name

Each contract object contains:

- `contract_id` — deployed Stellar contract ID
- `source` — Stellar CLI key alias used for deployment
- `version` — crate version from `Cargo.toml`
- `wasm_file` — relative path to the deployed WASM artifact
- `sha256` — SHA-256 hash of the deployed WASM artifact

Example `deployments/testnet.json` shape:

```json
{
  "generated_at_utc": "2026-05-30T12:00:00Z",
  "network": "testnet",
  "target": "wasm32-unknown-unknown",
  "contracts": {
    "confession-anchor": {
      "contract_id": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "source": "xconfess-deployer",
      "version": "0.1.0",
      "wasm_file": "target/wasm32-unknown-unknown/release/confession_anchor.wasm",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    "confession-registry": {
      "contract_id": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "source": "xconfess-deployer",
      "version": "0.1.0",
      "wasm_file": "target/wasm32-unknown-unknown/release/confession_registry.wasm",
      "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    "reputation-badges": {
      "contract_id": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "source": "xconfess-deployer",
      "version": "0.1.0",
      "wasm_file": "target/wasm32-unknown-unknown/release/reputation_badges.wasm",
      "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    "anonymous-tipping": {
      "contract_id": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "source": "xconfess-deployer",
      "version": "0.1.0",
      "wasm_file": "target/wasm32-unknown-unknown/release/anonymous_tipping.wasm",
      "sha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    }
  }
}
```

This file is safe to commit because it contains public deployment metadata and a named deployer key alias, not private key material.

**Expected output:**

```
Deploying confession-anchor (confession_anchor.wasm) to testnet...
Deploying confession-registry (confession_registry.wasm) to testnet...
Deploying reputation-badges (reputation_badges.wasm) to testnet...
Deploying anonymous-tipping (anonymous_tipping.wasm) to testnet...
Deployment metadata written to: ./deployments/testnet.json
```

### Step 4: Verify Deployment Metadata

```bash
# Check the deployment output
cat deployments/testnet.json | jq .

# Extract and record each contract ID:
jq '.contracts | to_entries[] | {name: .key, id: .value.contract_id}' deployments/testnet.json

# Example output:
# {
#   "name": "confession-anchor",
#   "id": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB5C"
# }
```

**Save these contract IDs.** Backend and frontend services will reference them in configuration.

### Step 5: Commit Deployment Record

```bash
git add deployments/testnet.json
git commit -m "deploy: contracts deployed to testnet, version X.Y.Z"
```

---

## Post-Deployment Verification

Set these variables from the deployment metadata before running the checklist:

```bash
export NETWORK="testnet"
export DEPLOYER_KEY="your-named-key"

export CONFESSION_ANCHOR_ID="$(jq -r '.contracts["confession-anchor"].contract_id' deployments/$NETWORK.json)"
export CONFESSION_REGISTRY_ID="$(jq -r '.contracts["confession-registry"].contract_id' deployments/$NETWORK.json)"
export REPUTATION_BADGES_ID="$(jq -r '.contracts["reputation-badges"].contract_id' deployments/$NETWORK.json)"
export ANONYMOUS_TIPPING_ID="$(jq -r '.contracts["anonymous-tipping"].contract_id' deployments/$NETWORK.json)"
```

### Step 1: Confirm All Contracts Are On-Chain

```bash
stellar contract info --id "$CONFESSION_ANCHOR_ID" --network "$NETWORK"
stellar contract info --id "$CONFESSION_REGISTRY_ID" --network "$NETWORK"
stellar contract info --id "$REPUTATION_BADGES_ID" --network "$NETWORK"
stellar contract info --id "$ANONYMOUS_TIPPING_ID" --network "$NETWORK"
```

Expected output includes contract code hash and other metadata.

### Step 2: Compare Deployment Hashes Against Local Artifacts

Verify the committed deployment metadata still matches the local release
artifacts:

```bash
jq -r '.contracts | to_entries[] | [.key, .value.wasm_file, .value.sha256] | @tsv' "deployments/$NETWORK.json" |
while IFS=$'\t' read -r contract wasm_path expected_sha; do
  actual_sha="$(sha256sum "xconfess-contracts/$wasm_path" | awk '{print $1}')"
  test "$actual_sha" = "$expected_sha"
  printf '%s %s\n' "$contract" "$actual_sha"
done
```

If this fails, stop the release and rebuild from the exact commit being
deployed.

### Step 3: Test Read-Only Contract Invocations

Run at least one read-only invocation per contract where practical:

```bash
# ConfessionAnchor::get_version
stellar contract invoke \
  --id "$CONFESSION_ANCHOR_ID" \
  --source "$DEPLOYER_KEY" \
  --network "$NETWORK" \
  -- get_version

# ConfessionRegistry::get_total_count
stellar contract invoke \
  --id "$CONFESSION_REGISTRY_ID" \
  --source "$DEPLOYER_KEY" \
  --network "$NETWORK" \
  -- get_total_count

# ReputationBadges::get_total_badges
stellar contract invoke \
  --id "$REPUTATION_BADGES_ID" \
  --source "$DEPLOYER_KEY" \
  --network "$NETWORK" \
  -- get_total_badges

# AnonymousTipping::latest_settlement_nonce
stellar contract invoke \
  --id "$ANONYMOUS_TIPPING_ID" \
  --source "$DEPLOYER_KEY" \
  --network "$NETWORK" \
  -- latest_settlement_nonce
```

If a contract was intentionally deployed but not initialized, record that in the
release notes and skip only the read call that requires initialization.

### Step 4: Check Event Emission (if applicable)

For contracts that emit events, verify events are being recorded:

```bash
# Fetch recent events from ConfessionAnchor
stellar contract events \
  --id "$CONFESSION_ANCHOR_ID" \
  --network "$NETWORK" \
  --limit 10
```

### Step 5: Backend and Frontend Integration

Once contract IDs are confirmed:

1. **Backend team**: Update `.env` or configuration to reference new contract IDs.
2. **Frontend team**: If contract ABIs or function signatures changed, regenerate TypeScript bindings.
3. **Integration test**: Run end-to-end smoke tests against the newly deployed contracts.

---

## Contract Reference

### ConfessionAnchor (`confession-anchor`)

**Purpose:** Stores tamper-proof 32-byte hashes of confessions on-chain.

**Key Functions:**
- `anchor_confession(hash: BytesN<32>, timestamp: u64) -> Symbol` — Anchor a new confession hash. Returns "anchored" or "exists".
- `verify_confession(hash: BytesN<32>) -> Option<u64>` — Return the anchored timestamp for a known hash.
- `get_confession_count() -> u64` — Total number of anchored confessions.
- `get_version() -> ContractVersionInfo` — Semantic version and build metadata.
- `get_capabilities() -> ContractCapabilityInfo` — Supported features and schema versions.

**No admin functions.** Contract is immutable once deployed.

### ConfessionRegistry (`confession-registry`)

**Purpose:** Lifecycle management and registry of confessions with governance controls.

**Key Functions:**
- `initialize(admin: Address)` — Set up contract with initial admin (call once at deployment).
- `set_quorum(threshold: u32)` — Configure governance quorum threshold (admin only).
- `gov_propose(proposer: Address, action: CriticalAction) -> u64` — Submit governance proposal.
- `get_total_count() -> u64` — Total number of registered confessions.
- `list_confessions(cursor: Option<u64>, limit: u32) -> Page` — Paginated confession listing.

**Important:** Registry is governance-controlled. Updates to critical settings require proposals.

### ReputationBadges (`reputation-badges`)

**Purpose:** Award and track user reputation badges on-chain.

**Key Functions:**
- `mint_badge(recipient: Address, badge_type: BadgeType) -> Result<u64, Error>` — Issue a badge to a user.
- `revoke_badge(badge_id: u64)` — Remove a badge from the chain.
- `get_badges(owner: Address) -> Vec<Badge>` — List all badges owned by a user.
- `get_total_badges() -> u64` — Total badges in circulation.

**Badge Types (fixed):**
- `ConfessionStarter` — First confession posted
- `PopularVoice` — 100+ reactions received
- `GenerousSoul` — Tipped 10+ confessions
- `CommunityHero` — 50+ confessions posted
- `TopReactor` — 500+ reactions given

### AnonymousTipping (`anonymous-tipping`)

**Purpose:** Decentralized, anonymous tip settlement and tracking.

**Key Functions:**
- `init(env: Env)` — Initialize the settlement nonce (call once at deployment).
- `send_tip(recipient: Address, amount: i128) -> u64` — Send an anonymous tip, returns settlement ID.
- `send_tip_with_proof(recipient: Address, amount: i128, proof_metadata: Option<String>) -> u64` — Send tip with optional proof metadata (max 128 chars).
- `get_tips(recipient: Address) -> i128` — Query total tips received by address.
- `latest_settlement_nonce() -> u64` — Get the current settlement nonce.

**No admin functions.** Contract is fully decentralized (no admin controls).

---

## Storage Migration Testing

Before any release that touches contract storage layout, run the migration
and storage-compatibility test suites and confirm they pass:

```bash
npm run contract:test
```

This runs `cargo test --workspace`, which includes:

- **`xconfess-contracts/contracts/tests/storage_compat_tests.rs`** — pins
  persisted state (confessions, reports, badges, reputation, tips, pause
  flags) across a simulated upgrade: state is written through one client and
  read back through a second client pointed at the same contract address,
  mirroring what happens when new WASM is deployed over an existing address.
- **`xconfess-contracts/contracts/**/tests/migration.rs`** (one per contract:
  `confession-anchor`, `anonymous-tipping`, `confession-registry`,
  `reputation-badges`) — exercises each contract's `schema_version()` /
  `migrate()` handler pair: default version before migration, idempotent
  re-migration, owner/admin-only authorization, and that pre-existing data
  survives the migration untouched.

**Assumption enforced by these tests:** every contract that stores versioned
state must expose a `schema_version()` reader and a `migrate(caller)` handler.
A contract with a missing or incomplete version handler fails its
`migration.rs` suite immediately (`schema_version_is_initial_before_migration`
or `migrate_bumps_schema_version_to_current` fails to compile/pass) rather
than silently drifting at upgrade time. Schema bumps must only **add** storage
keys — never rewrite or remove existing ones — so a rollback to the prior
WASM build can safely ignore keys it doesn't understand.

---

## Upgrade and Rollback

### Contract Upgrade Limitations

**Important:** None of the four contracts support in-place upgrades on Stellar/Soroban. Contracts are immutable once deployed.

To deploy a new contract version:

1. **Build** the new version with updated Cargo.toml versions.
2. **Deploy** the new WASM as a new contract ID (separate from the old contract).
3. **Migrate** backend and frontend to reference the new contract IDs.
4. **Archive** the old contract metadata for reference.

### Rollback Procedure

If a contract deployment fails or causes issues:

1. **Halt the release.** Stop all downstream services from consuming the new contract ID.
2. **Revert deployment records.**  Use the previous `deployments/<network>.json` file to identify the working contract IDs.
3. **Restore backend/frontend config** to reference the old contract IDs.
4. **Post-rollback analysis**: Review logs and contract invocation failures to understand what went wrong.

### Pause Or Mitigate After Deployment

If a deployed contract is live but unsafe to use:

1. Disable backend/frontend code paths that send writes to the new contract IDs.
2. For contracts with pause controls, follow
   [`docs/contract-signer-rotation-runbook.md`](./contract-signer-rotation-runbook.md)
   and the pause model in
   [`xconfess-contracts/EMERGENCY_PAUSE_MODEL.md`](../xconfess-contracts/EMERGENCY_PAUSE_MODEL.md).
3. Restore the previous known-good IDs from `deployments/<network>.json` in
   service configuration.
4. Follow the general release rollback checklist in
   [`docs/release-readiness-checklist.md`](./release-readiness-checklist.md).

### Version Signaling

Each contract includes version metadata accessible at runtime:

```bash
# Get version info from deployed contract
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$DEPLOYER_KEY" \
  --network testnet \
  -- get_version
```

Returns a `ContractVersionInfo` struct with:
- `major`, `minor`, `patch` — Semantic version (see [VERSIONING.md](../xconfess-contracts/VERSIONING.md))
- `build_metadata` — Build identifier and timestamp

Use these values to confirm which version is running on each network.

---

## Troubleshooting

### Build Failures

**Error: "Missing required command: cargo"**

```bash
# Rust is not installed or not in PATH
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

**Error: "cargo build --locked" fails with dependency issues**

```bash
# Cargo.lock is out of sync
# Delete it and run build again (will regenerate lock)
rm xconfess-contracts/Cargo.lock
./scripts/contracts-release.sh build
```

**Error: WASM target not found**

```bash
# wasm32-unknown-unknown target not installed
rustup target add wasm32-unknown-unknown
./scripts/contracts-release.sh build
```

### Deployment Failures

**Error: "Account not found"**

```bash
# Deployer account does not exist or is not funded on the target network
stellar network use testnet
stellar keys fund "$DEPLOYER_KEY"  # Use testnet faucet if available
# Or manually fund via https://laboratory.stellar.org
```

**Error: "stellar: command not found"**

```bash
# Stellar CLI is not installed or not in PATH
cargo install --locked stellar-cli --version 22.0.0 --features opt
stellar --version
```

**Error: "Invalid network"**

```bash
# Network not configured in Stellar CLI
stellar network add-remote testnet https://horizon-testnet.stellar.org
stellar network use testnet
stellar network list
```

**Error: "Contract deploy timeout"**

```bash
# Network congestion; wait and retry
sleep 10
./scripts/contracts-release.sh deploy --network testnet --source "$DEPLOYER_KEY"
```

### Verification Failures

**Contract invocation returns error code**

```bash
# The contract is deployed but rejects the function call
# Possible causes:
# 1. Wrong function name (typo in CLI command)
# 2. Function requires specific arguments (check Contract Reference)
# 3. Contract not yet initialized (some functions require init() first)

# Verify the contract exists
stellar contract fetch --id "$CONTRACT_ID" --network testnet --out-file check.wasm
# If this succeeds, the contract is on-chain and can be invoked
```

---

## References

- [VERSIONING.md](../xconfess-contracts/VERSIONING.md) — Contract versioning policy and SemVer rules
- [README.md](../xconfess-contracts/README.md) — Toolchain setup and project structure
- [DEPLOYMENT.md](../xconfess-contracts/DEPLOYMENT.md) — Manual deployment steps (use scripts-release.sh instead)
- [CONTRACT_LIFECYCLE.md](../xconfess-contracts/CONTRACT_LIFECYCLE.md) — Contract initialization details (outdated; prefer this runbook)
- [Stellar Contract Docs](https://developers.stellar.org/docs/smart-contracts/) — Stellar Soroban documentation
- [Stellar CLI Docs](https://developers.stellar.org/docs/tools-and-sdks#cli) — Stellar CLI reference

---

**Last updated:** 2026-03-28  
**Owner:** xConfess Platform Team<br>
**Status:** Canonical — All releases use this runbook
