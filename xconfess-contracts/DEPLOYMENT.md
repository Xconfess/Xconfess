# Soroban Contract Deployment Guide

Complete guide for deploying xConfess smart contracts to Stellar networks.

## Canonical Reproducible Flow

Use the single root script for both build and deploy operations:

```bash
# From repository root
./scripts/contracts-release.sh build
./scripts/contracts-release.sh deploy --network testnet --source deployer
```

This flow builds all workspace contract crates with locked dependencies, verifies
the expected WASM artifacts, and writes deployment metadata including crate
versions and SHA-256 hashes.

Versioning expectations for crate releases are defined in
[`VERSIONING.md`](./VERSIONING.md).

## 📋 Prerequisites

Before deploying contracts, ensure you have:

1. ✅ Soroban development environment set up (see [README.md](./README.md))
2. ✅ All contracts built successfully with `stellar contract build`
3. ✅ Stellar account with testnet XLM (for testing)
4. ✅ Stellar CLI v22.0.0 or later

For Windows contributors, see [WINDOWS_SETUP.md](./WINDOWS_SETUP.md) for
platform-specific notes on PowerShell, the WASM target, and path issues.

Before a full deployment, run the automated preflight check from the repository
root to verify all prerequisites at once:

```bash
./scripts/contracts-preflight.sh           # build-only checks
./scripts/contracts-preflight.sh --deploy  # also checks key, network, and Stellar CLI
```

A dry-run checklist with manual verification steps is available in
[TESTNET_DRY_RUN_CHECKLIST.md](./TESTNET_DRY_RUN_CHECKLIST.md).

### Quick Setup Check

```bash
# From xconfess-contracts directory
source $HOME/.cargo/env

# Verify tools
rustc --version  # Should be 1.81+
cargo --version
stellar --version  # Should be 22.0.0+
```

## 🌐 Network Configuration

### Add Testnet Network

```bash
# Configure testnet network
stellar network add-remote testnet https://horizon-testnet.stellar.org
stellar network use testnet

# Verify configuration
stellar network list
```

### Create/Fund Test Account

```bash
# Create a new account (if needed)
stellar keys generate --name mykey

# Get public key
stellar keys show mykey

# Fund account (use Stellar testnet faucet)
# Visit: https://laboratory.stellar.org/#account-creator?network=testnet
```

## 🚀 Building Contracts

### Canonical Build (Recommended)

From the repository root, use the canonical release script:

```bash
# From repository root
./scripts/contracts-release.sh build
```

This builds all contracts with locked dependencies, verifies artifacts, and generates deployment metadata.

### Manual Build (if needed)

```bash
cd xconfess-contracts

# Build all for WebAssembly
cargo build --locked --workspace --release --target wasm32-unknown-unknown
```

### Build for Testing

```bash
# Build with debug info (faster for development)
cargo build --target wasm32-unknown-unknown
```

## 📦 Contract Locations

After building, compiled contracts are at:

```
xconfess-contracts/target/wasm32-unknown-unknown/release/
├── confession_anchor.wasm
├── confession_registry.wasm
├── reputation_badges.wasm
└── anonymous_tipping.wasm
```

All four contracts are built and deployed together.

## 🚁 Deployment Steps (Using Canonical Script)

**Use the canonical deployment script instead of manual steps:**

```bash
# From repository root
./scripts/contracts-release.sh deploy --network testnet --source deployer
```

Replace:
- `testnet` with the target network (futurenet, public, etc.)
- `deployer` with the name of your Stellar CLI key

**What the script does:**
1. Verifies all WASM artifacts exist
2. Deploys each contract in sequence
3. Records each returned contract ID
4. Generates `deployments/testnet.json` with all metadata

**Result:** Check `deployments/testnet.json` for the contract IDs of all four contracts.

```bash
# Extract contract IDs
jq '.contracts | to_entries[] | {name: .key, id: .value.contract_id}' deployments/testnet.json
```

**Do not manually deploy individual contracts.** The script ensures all four contracts are built and deployed from the same `Cargo.lock` snapshot.

## 🧪 Testing Contracts

### Unit Tests

```bash
# Run all contract tests
cd xconfess-contracts
cargo test

# Run specific contract tests
cargo test -p confession-anchor
cargo test -p confession-registry
cargo test -p reputation-badges
cargo test -p anonymous-tipping

# Run with output
cargo test -- --nocapture
```

### Canonical Test Script

```bash
# From repository root
./scripts/test-contracts.sh
```

### Post-Deployment Verification

After deploying to a network, test contract invocations:

```bash
# Test ConfessionAnchor — get_version is a read-only call available on all contracts
stellar contract invoke \
  --id $CONFESSION_ANCHOR_ID \
  --source "$DEPLOYER_KEY" \
  --network testnet \
  -- get_version
```

## Deployment Metadata

Contract IDs are automatically saved in `deployments/<network>.json` by the canonical script:

```bash
# View deployment metadata
cat deployments/testnet.json | jq '.'

# Extract contract IDs
jq '.contracts | to_entries[] | {name: .key, id: .value.contract_id}' deployments/testnet.json
```

This file includes:
- Generated timestamp
- Network name
- All four contract IDs
- Version and SHA-256 hash for each contract WASM

**Important:** Commit this file to version control for tracking which versions are deployed to each network.

```bash
git add deployments/testnet.json
git commit -m "deploy: contracts deployed to testnet"
```

Example `deployments/testnet.json` structure:

```json
{
  "generated_at_utc": "2025-01-01T00:00:00Z",
  "network": "testnet",
  "target": "wasm32-unknown-unknown",
  "contracts": {
    "confession-anchor": {
      "contract_id": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "sha256": "abc123...",
      "version": "0.1.0",
      "wasm_file": "target/wasm32-unknown-unknown/release/confession_anchor.wasm"
    },
    "confession-registry": {
      "contract_id": "CWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
      "sha256": "def456...",
      "version": "0.1.0",
      "wasm_file": "target/wasm32-unknown-unknown/release/confession_registry.wasm"
    },
    "reputation-badges": {
      "contract_id": "CYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY",
      "sha256": "ghi789...",
      "version": "0.1.0",
      "wasm_file": "target/wasm32-unknown-unknown/release/reputation_badges.wasm"
    },
    "anonymous-tipping": {
      "contract_id": "CZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ",
      "sha256": "jkl012...",
      "version": "0.1.0",
      "wasm_file": "target/wasm32-unknown-unknown/release/anonymous_tipping.wasm"
    }
  }
}
```

## 🔍 Verify Deployment

### Check Contract on Network

```bash
# Get contract info
stellar contract info \
  --id $CONFESSION_ANCHOR_ID \
  --network testnet
```

### View Contract Source

```bash
# Download and view contract WASM
stellar contract fetch \
  --id $CONFESSION_ANCHOR_ID \
  --network testnet \
  --out-file confession_anchor_deployed.wasm
```

## 🐛 Troubleshooting

### Error: "Account not found"

```bash
# Account not funded on testnet
# Use Stellar Testnet Faucet:
# https://laboratory.stellar.org/#account-creator?network=testnet
```

### Error: "Invalid wasm"

```bash
# Rebuild contract with correct target
cargo build --release --target wasm32-unknown-unknown --all
```

### Error: "Contract already exists"

```bash
# Use different contract ID or create new account
# Check existing deployments in deployments/testnet.json
```

### Slow Deployment

```bash
# Testnet may be slow
# Wait 5-10 seconds between deployments
# Check network status: https://status.stellar.org
```

## 📊 Deployment Checklist

Before deploying to production:

- [ ] All contracts build without warnings
- [ ] All tests pass (`cargo test`)
- [ ] Code reviewed for security
- [ ] Testnet deployment successful
- [ ] Contract functions tested via CLI
- [ ] Contract IDs saved to `deployments/`
- [ ] Documentation updated
- [ ] Network is correct (testnet vs mainnet)
- [ ] Account has sufficient balance
- [ ] Backup of secret keys created

## 🔐 Production Deployment

### Mainnet Deployment (Use with Caution!)

```bash
# Configure mainnet
stellar network add-remote mainnet https://horizon.stellar.org
stellar network use mainnet

# Deploy with additional safety checks
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/confession_anchor.wasm \
  --source-account $PRODUCTION_ACCOUNT \
  --network mainnet
```

**⚠️ WARNING:** Only deploy to mainnet after thorough testing on testnet!

## 📚 Additional Resources

- [Stellar Contract Deploy Docs](https://developers.stellar.org/docs/build/smart-contracts)
- [Soroban CLI Reference](https://soroban.stellar.org/docs/learn/storing-data)
- [Stellar Laboratory](https://laboratory.stellar.org/)
- [Horizon API Docs](https://developers.stellar.org/api/)

## 📞 Support

For issues or questions:

1. Check [README.md](./README.md) for setup help
2. Review Soroban documentation
3. Test on testnet first
4. Report issues to project maintainers
