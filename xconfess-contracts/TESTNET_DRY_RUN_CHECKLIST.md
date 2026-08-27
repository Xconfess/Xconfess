# Testnet Deployment Dry-Run Checklist

Run through this checklist from a fresh terminal before spending time on a full
testnet deployment. Each item shows the expected command and a clear pass/fail
signal.

> **Security note:** Never paste your private key or seed phrase into any command
> or config file. All key references below use named keys managed by the Stellar
> CLI key store.

---

## 1. Stellar CLI version

```bash
stellar --version
```

**Pass:** output contains `22.0.0` or later (e.g. `stellar 22.1.0`).  
**Fail:** command not found, or version is older than `22.0.0`. Install or
upgrade via `cargo install --locked stellar-cli --features opt`.

---

## 2. Rust toolchain

```bash
rustc --version
cargo --version
```

**Pass:** `rustc 1.81.0` or later.  
**Fail:** version below `1.81.0`. Run `rustup update stable`.

---

## 3. WASM target installed

```bash
rustup target list --installed | grep wasm32-unknown-unknown
```

**Pass:** `wasm32-unknown-unknown` appears in the output.  
**Fail:** no output. Fix with `rustup target add wasm32-unknown-unknown`.

---

## 4. Named key present in Stellar CLI key store

```bash
stellar keys list
```

**Pass:** your deployer key name (e.g. `deployer`) appears in the list.  
**Fail:** key is missing. Generate one with `stellar keys generate --name deployer`.

---

## 5. Deployer account funded on testnet

```bash
stellar keys show deployer           # prints the public key
stellar account show --account <PUBLIC_KEY> --network testnet
```

**Pass:** the `account show` call returns JSON with a non-zero XLM balance.  
**Fail:** `account not found` error. Fund via the
[Stellar Testnet Friendbot](https://laboratory.stellar.org/#account-creator?network=testnet)
or run:

```bash
curl "https://friendbot.stellar.org?addr=$(stellar keys show deployer)"
```

---

## 6. Network configured

```bash
stellar network list
```

**Pass:** `testnet` appears in the list.  
**Fail:** `testnet` is absent. Add it:

```bash
stellar network add-remote testnet https://horizon-testnet.stellar.org
```

---

## 7. WASM artifacts exist

Run this from the repository root after a successful `./scripts/contracts-release.sh build`:

```bash
ls xconfess-contracts/target/wasm32-unknown-unknown/release/*.wasm
```

**Pass:** all four files are present:

```
confession_anchor.wasm
confession_registry.wasm
reputation_badges.wasm
anonymous_tipping.wasm
```

**Fail:** one or more files are missing. Re-run the build:

```bash
./scripts/contracts-release.sh build
```

---

## 8. WASM manifest is current

```bash
cat deployments/contract-wasm-manifest.json | jq '.generated_at_utc'
```

**Pass:** timestamp matches (or postdates) your most recent build.  
**Fail:** file is missing or timestamp is stale. Re-run `./scripts/contracts-release.sh build`.

---

## 9. Workspace Cargo.toml is reachable

```bash
cargo metadata --manifest-path xconfess-contracts/Cargo.toml --no-deps --quiet > /dev/null && echo OK
```

**Pass:** prints `OK`.  
**Fail:** cargo reports an error — check for syntax issues in `Cargo.toml` or a
broken workspace member path.

---

## All checks passed?

```
[ ] stellar --version >= 22.0.0
[ ] rustc --version >= 1.81.0
[ ] wasm32-unknown-unknown target installed
[ ] Deployer key present in stellar keys list
[ ] Deployer account funded on testnet
[ ] testnet network configured in stellar network list
[ ] All four .wasm artifacts present in target/
[ ] deployments/contract-wasm-manifest.json is current
[ ] cargo metadata succeeds on xconfess-contracts/Cargo.toml
```

Once every item is checked, proceed with:

```bash
./scripts/contracts-release.sh deploy --network testnet --source deployer
```
