# Soroban Development Environment Setup

Complete guide for setting up the Soroban development environment for xConfess smart contract development.

---

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software Checklist

- [ ] **Rust** (v1.74.0 or later)
- [ ] **Cargo** (comes with Rust)
- [ ] **Stellar CLI** (latest version)
- [ ] **Node.js** (v18.0.0 or later)
- [ ] **Git** (v2.30.0 or later)

### Verify Installation

```bash
# Check Rust version
rustc --version  # Should be 1.74.0+

# Check Cargo version
cargo --version

# Check Node.js version
node --version  # Should be v18.0.0+

# Check Git version
git --version
```

---

## Installation Steps

### macOS

#### 1. Install Rust

```bash
# Install Rust using rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Restart terminal or run:
source $HOME/.cargo/env

# Verify installation
rustc --version
```

#### 2. Install Stellar CLI

```bash
# Install Stellar CLI with optimizations
cargo install --locked stellar-cli --features opt

# Verify installation
stellar --version
```

#### 3. Add WebAssembly Target

```bash
# Add wasm32 target for Soroban
rustup target add wasm32-unknown-unknown

# Verify
rustup target list | grep wasm32
```

#### 4. Install Node.js (if needed)

```bash
# Using Homebrew
brew install node

# Verify
node --version
npm --version
```

---

### Linux

#### 1. Install Rust

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add to PATH
source $HOME/.cargo/env

# Verify
rustc --version
```

#### 2. Install Build Dependencies

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev

# Fedora
sudo dnf install gcc openssl-devel pkg-config

# Arch Linux
sudo pacman -S base-devel openssl pkg-config
```

#### 3. Install Stellar CLI

```bash
cargo install --locked stellar-cli

# Verify
stellar --version
```

#### 4. Add WebAssembly Target

```bash
rustup target add wasm32-unknown-unknown
```

---

### Windows (WSL2)

**Note:** Soroban development on Windows requires WSL2.

#### 1. Install WSL2

```powershell
# In PowerShell (Administrator)
wsl --install -d Ubuntu-22.04

# Restart computer
```

#### 2. Inside WSL2

```bash
# Update package manager
sudo apt update && sudo apt upgrade -y

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install dependencies
sudo apt install -y build-essential pkg-config libssl-dev

# Install Stellar CLI
cargo install --locked stellar-cli --features opt

# Add wasm32 target
rustup target add wasm32-unknown-unknown
```

---

## Build Instructions

### Building the confession-anchor Contract

#### Step 1: Navigate to Contract Directory

```bash
cd xconfess-contracts
```

#### Step 2: Build with Stellar CLI (Recommended)

```bash
# Build the contract
stellar contract build
```

Output location: `target/wasm32-unknown-unknown/release/confession_anchor.wasm`

#### Step 3: Alternative Build with Cargo

```bash
# Build for WebAssembly
cargo build --target wasm32-unknown-unknown --release
```

#### Using the Build Script

```bash
# From project root (recommended canonical flow)
./scripts/contracts-release.sh build
```

---

## Testing Guide

### Running Tests

#### Step 1: Navigate to Contract Directory

```bash
cd xconfess-contracts
```

#### Step 2: Run All Tests

```bash
# Run tests
cargo test

# Run with verbose output
cargo test -- --nocapture
```

#### Step 3: Run Specific Tests

```bash
# Run a specific test
cargo test anchor_and_verify_confession

# Run tests matching a pattern
cargo test verify
```

#### Using the Test Script

```bash
# From project root
./scripts/test-contracts.sh

# With verbose output
./scripts/test-contracts.sh --verbose
```

The script is the canonical local validation flow for the contract workspace.
It runs three phases in order:

1. `cargo check -p <crate>` for every workspace crate.
2. `cargo build --workspace --target wasm32-unknown-unknown` once for the full workspace.
3. `cargo test -p <crate>` for every workspace crate.

The current workspace crates are:

- `confession-anchor`
- `confession-registry`
- `anonymous-tipping`
- `reputation-badges`

### Expected Test Output

```
[INFO] Workspace contract crates: confession-anchor confession-registry anonymous-tipping reputation-badges
[OK] CHECK passed for confession-anchor
[OK] CHECK passed for confession-registry
[OK] BUILD passed for workspace wasm32
[OK] TEST passed for reputation-badges
```

---

## Testnet Wallet Setup

Before deploying contracts or running on-chain operations locally, you need a funded testnet keypair.

### Step 1: Generate a testnet keypair

```bash
# Generate a new keypair named "deployer" for the testnet network
stellar keys generate --global deployer --network testnet

# Display the public key (shareable)
stellar keys address deployer

# Display the secret key (NEVER share or commit this)
stellar keys show deployer
```

### Step 2: Fund the account via Friendbot

```bash
# Fund the account on testnet
curl "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"
```

Wait 5–10 seconds for the transaction to be confirmed on the network, then verify:

```bash
# Check account exists on Horizon
curl "https://horizon-testnet.stellar.org/accounts/$(stellar keys address deployer)"
```

### Step 3: Add the secret to your backend .env

Copy the secret key and set it as `STELLAR_SERVER_SECRET` in `xconfess-backend/.env`:

```env
STELLAR_SERVER_SECRET=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Important notes

- **Testnet funds are free and reset periodically** (typically every 3 months). Re-fund your account if transactions fail with insufficient balance.
- **Never commit secrets.** The `.env` file is gitignored. Always use `.env.example` templates for committed configuration.
- **Use the `stellar keys` command** to manage keys rather than raw secret strings. This avoids accidentally leaking secrets in shell history.
- **Testnet is for development only.** For production or mainnet testing, use a hardware wallet or a dedicated signing service.

### Troubleshooting: "account not found" errors from Horizon

**Problem:** `POST /transactions` returns HTTP 404 or `transaction failed — source account not found`.

**Cause:** The account is either not yet funded, or Horizon has not indexed it yet.

**Solution:**

1. Verify the account exists on the network:
   ```bash
   curl "https://horizon-testnet.stellar.org/accounts/$(stellar keys address deployer)"
   ```
2. If the account is missing, re-fund it via Friendbot:
   ```bash
   curl "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"
   ```
3. Wait 10–15 seconds and try again. Horizon can be a few ledgers behind Friendbot.
4. If Horizon returns a 404 with `"type": "https://stellar.org/horizon-errors/not_found"`, the account genuinely does not exist on the network. Ensure you used the correct network (`testnet`) when generating and funding the key.

For deeper reading, see the official Stellar docs:
- [Stellar Keys & Accounts](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts)
- [Friendbot](https://developers.stellar.org/docs/learn/fundamentals/networks#friendbot)
- [Horizon API Reference](https://developers.stellar.org/api/horizon/)

---

## Deployment Guide

### Deploy to Stellar Testnet

#### Step 1: Configure Testnet

```bash
# Add testnet network
stellar network add \
  --global testnet \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015"

# Verify
stellar network ls
```

#### Step 2: Create Identity

```bash
# Generate new keypair
stellar keys generate --global deployer --network testnet

# Get public key
stellar keys address deployer
```

#### Step 3: Fund Account

```bash
# Fund using Friendbot
curl "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"
```

#### Step 4: Deploy Contract

```bash
# Build and deploy all contract crates with one flow
./scripts/contracts-release.sh build
./scripts/contracts-release.sh deploy --network testnet --source deployer
```

Save the returned contract ID (e.g., `CCHDY246UUPY6VUGIDVSK266KXA64CXM6RR2QLTKJD7E7IGV74ZP5XFB`)

#### Using the Deploy Script

```bash
# From project root
./scripts/contracts-release.sh deploy --network testnet --source deployer
```

---

## Environment Variables Setup

### Backend (.env)

Create `.env` in `xconfess-backend/`:

```env
# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org:443
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Contract IDs
CONFESSION_ANCHOR_CONTRACT=CCHDY246UUPY6VUGIDVSK266KXA64CXM6RR2QLTKJD7E7IGV74ZP5XFB

# Deployer — use a Stellar CLI key name, never a raw secret
# Generate with: stellar keys generate --global deployer --network testnet
# DEPLOYER_KEY_NAME=deployer
```

### Frontend (.env.local)

Create `.env.local` in `xconfess-frontend/`:

```env
# Stellar
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org:443
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Contracts
NEXT_PUBLIC_CONFESSION_ANCHOR_CONTRACT=CCHDY246UUPY6VUGIDVSK266KXA64CXM6RR2QLTKJD7E7IGV74ZP5XFB
```

---

## Troubleshooting Common Issues

### 1. "stellar: command not found"

**Problem:** Stellar CLI not in PATH

**Solution:**

```bash
# Add Cargo bin to PATH
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Or for bash
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 2. "error: linker `cc` not found"

**Problem:** Missing build tools

**Solution:**

```bash
# Ubuntu/Debian
sudo apt install build-essential

# macOS
xcode-select --install

# Fedora
sudo dnf install gcc
```

### 3. "error: target 'wasm32-unknown-unknown' not found"

**Problem:** WebAssembly target not installed

**Solution:**

```bash
rustup target add wasm32-unknown-unknown
```

### 4. Contract deployment fails with "account not found"

**Problem:** Account not funded on testnet

**Solution:**

```bash
# Fund your account
curl "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"

# Wait 5-10 seconds and try again
```

### 5. "Transaction simulation failed"

**Problem:** Contract parameters incorrect or network issue

**Solution:**

- Verify contract parameters match expected types
- Check network connectivity
- Ensure contract is deployed correctly
- Try increasing transaction timeout

### 6. Build fails with memory errors

**Problem:** Insufficient memory

**Solution:**

```bash
# Build with less parallelism
cargo build --target wasm32-unknown-unknown --release -j 1
```

---

## Contract Interaction Examples

### JavaScript/TypeScript

#### Install Dependencies

```bash
npm install @stellar/stellar-sdk
```

#### Anchor a Confession

```javascript
import * as StellarSDK from "@stellar/stellar-sdk";

const CONTRACT_ID = "CCHDY246UUPY6VUGIDVSK266KXA64CXM6RR2QLTKJD7E7IGV74ZP5XFB";
const RPC_URL = "https://soroban-testnet.stellar.org:443";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const server = new StellarSDK.SorobanRpc.Server(RPC_URL);

async function anchorConfession(confessionHash, userSecretKey) {
  const sourceKeypair = StellarSDK.Keypair.fromSecret(userSecretKey);
  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());

  const contract = new StellarSDK.Contract(CONTRACT_ID);

  // Convert hash to BytesN<32>
  const hashBuffer = Buffer.from(confessionHash, "hex");
  const hashScVal = StellarSDK.nativeToScVal(hashBuffer, { type: "bytes" });

  // Current timestamp
  const timestamp = Date.now();
  const timestampScVal = StellarSDK.nativeToScVal(timestamp, { type: "u64" });

  // Build transaction
  const transaction = new StellarSDK.TransactionBuilder(sourceAccount, {
    fee: StellarSDK.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("anchor_confession", hashScVal, timestampScVal))
    .setTimeout(30)
    .build();

  // Simulate
  const simulateResponse = await server.simulateTransaction(transaction);

  // Prepare and sign
  const preparedTx = StellarSDK.SorobanRpc.assembleTransaction(
    transaction,
    simulateResponse,
  );
  preparedTx.sign(sourceKeypair);

  // Submit
  const sendResponse = await server.sendTransaction(preparedTx);

  // Poll for result
  let getResponse = await server.getTransaction(sendResponse.hash);
  while (getResponse.status === "NOT_FOUND") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    getResponse = await server.getTransaction(sendResponse.hash);
  }

  return sendResponse.hash;
}
```

#### Verify a Confession

```javascript
async function verifyConfession(confessionHash) {
  const contract = new StellarSDK.Contract(CONTRACT_ID);
  const keypair = StellarSDK.Keypair.random();
  const account = await server.getAccount(keypair.publicKey());

  const hashBuffer = Buffer.from(confessionHash, "hex");
  const hashScVal = StellarSDK.nativeToScVal(hashBuffer, { type: "bytes" });

  const transaction = new StellarSDK.TransactionBuilder(account, {
    fee: StellarSDK.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("verify_confession", hashScVal))
    .setTimeout(30)
    .build();

  const simulateResponse = await server.simulateTransaction(transaction);

  if (StellarSDK.SorobanRpc.Api.isSimulationSuccess(simulateResponse)) {
    const result = simulateResponse.result?.retval;
    return result ? Number(StellarSDK.scValToNative(result)) : null;
  }

  return null;
}
```

### How to Call Contracts from Frontend

```typescript
// src/lib/stellar/contract.ts
import * as StellarSDK from "@stellar/stellar-sdk";
import crypto from "crypto";

export async function anchorConfessionFromFrontend(
  confessionText: string,
  secretKey: string,
): Promise<string> {
  // Create SHA-256 hash
  const hash = crypto.createHash("sha256").update(confessionText).digest("hex");

  // Call anchor function
  const txHash = await anchorConfession(hash, secretKey);

  return txHash;
}

export async function verifyConfessionFromFrontend(
  confessionText: string,
): Promise<number | null> {
  // Create SHA-256 hash
  const hash = crypto.createHash("sha256").update(confessionText).digest("hex");

  // Call verify function
  const timestamp = await verifyConfession(hash);

  return timestamp;
}
```

### How to Verify Transactions

```javascript
async function getTransactionStatus(txHash) {
  const response = await server.getTransaction(txHash);

  switch (response.status) {
    case "SUCCESS":
      console.log("Transaction successful!");
      return response;
    case "FAILED":
      console.error("Transaction failed:", response.resultXdr);
      return null;
    case "NOT_FOUND":
      console.log("Transaction not found (still pending)");
      return null;
    default:
      console.log("Unknown status:", response.status);
      return null;
  }
}

// Usage
const txHash = await anchorConfession(hash, secretKey);
const result = await getTransactionStatus(txHash);
```

---

## Additional Resources

### Official Documentation

- **Soroban Documentation**: https://soroban.stellar.org/docs
- **Stellar CLI**: https://developers.stellar.org/docs/tools/developer-tools
- **Stellar SDK**: https://stellar.github.io/js-stellar-sdk/

### Getting Help

- **Stellar Discord**: https://discord.gg/stellardev
- **Stellar Stack Exchange**: https://stellar.stackexchange.com/
- **xConfess Community**: https://t.me/xconfess_Community

---

_Last updated: January 24, 2026_
