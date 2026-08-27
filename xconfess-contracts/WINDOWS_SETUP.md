# Windows Setup for Stellar CLI and Rust Contract Deployment

This guide covers Windows-specific considerations for contributors who want to
build or deploy xConfess Soroban contracts on a Windows machine.

---

## Recommended approach: WSL 2

The canonical build and deploy scripts (`scripts/contracts-release.sh`,
`scripts/deploy-contracts.sh`, etc.) are **bash scripts** and run without
modification under [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install)
(Windows Subsystem for Linux). Unless you have a specific reason to stay in a
native Windows shell, **WSL 2 with Ubuntu is the path of least resistance**.

```powershell
# Install WSL 2 (run in an elevated PowerShell or Windows Terminal)
wsl --install
# Restart your machine, then open the Ubuntu app and follow the prompts.
```

All subsequent steps in the standard README and DEPLOYMENT.md apply unchanged
inside WSL 2.

---

## Native Windows (PowerShell) — what works and what does not

If you must work natively in PowerShell, be aware of the following.

### Shell expectations

| Script / command | Works in PowerShell? | Notes |
|---|---|---|
| `./scripts/contracts-release.sh build` | No | Bash syntax; use WSL 2 or Git Bash |
| `cargo build --locked ...` | Yes | Cargo is cross-platform |
| `stellar contract deploy ...` | Yes | Stellar CLI is cross-platform |
| `rustup target add ...` | Yes | Rustup is cross-platform |

For any `.sh` script you need to run natively, you can open it in
[Git Bash](https://git-scm.com/download/win) instead.

### Install Rust on Windows

Download and run the official installer from <https://rustup.rs/>. It installs
`rustup`, `cargo`, and the stable toolchain.

After installation, open a **new** terminal so that the `%USERPROFILE%\.cargo\bin`
directory is on your `PATH`.

Verify:

```powershell
rustc --version
cargo --version
```

### Add the WASM target

```powershell
rustup target add wasm32-unknown-unknown
```

Verify:

```powershell
rustup target list --installed
# wasm32-unknown-unknown should appear
```

### Common PATH and environment issues

1. **`cargo` not found after install**  
   Close and reopen your terminal. The Rust installer modifies `PATH` only for
   new sessions. On some corporate machines you may need to add
   `%USERPROFILE%\.cargo\bin` to your user `PATH` manually via
   *System Properties → Environment Variables*.

2. **`CARGO_HOME` / `RUSTUP_HOME` on a non-`C:` drive**  
   If your user profile is on a drive other than `C:`, set both environment
   variables explicitly before running any `cargo` or `rustup` commands:

   ```powershell
   $env:CARGO_HOME  = "D:\rust\cargo"
   $env:RUSTUP_HOME = "D:\rust\rustup"
   ```

   Or set them permanently via System Properties → Environment Variables.

3. **Long-path errors during `cargo build`**  
   Rust/LLVM temporary paths can exceed the Windows 260-character limit. Enable
   long paths in Group Policy or via the registry:

   ```powershell
   # Run in an elevated PowerShell
   Set-ItemProperty `
     -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
     -Name LongPathsEnabled `
     -Value 1
   ```

   Then add `[build] target-dir = "C:/rust-target"` to a short path in
   `.cargo/config.toml` to keep artifact paths short.

### Install Stellar CLI on Windows

Stellar CLI is distributed as a Rust binary and can be installed with cargo:

```powershell
cargo install --locked stellar-cli --features opt
```

After installation, verify:

```powershell
stellar --version   # expect 22.0.0 or later
```

If `stellar` is not found, ensure `%USERPROFILE%\.cargo\bin` is on your `PATH`
(same fix as for `cargo` above).

### Build contracts natively (PowerShell)

```powershell
cd xconfess-contracts

# Build all contracts for WASM
cargo build --locked --workspace --release --target wasm32-unknown-unknown
```

Artifacts land in:

```
xconfess-contracts\target\wasm32-unknown-unknown\release\
├── confession_anchor.wasm
├── confession_registry.wasm
├── reputation_badges.wasm
└── anonymous_tipping.wasm
```

### Deploy contracts natively (PowerShell)

The canonical `contracts-release.sh deploy` command cannot run in native
PowerShell. As an alternative, use the Stellar CLI directly for each contract:

```powershell
$network   = "testnet"
$sourceKey = "deployer"
$targetDir = "xconfess-contracts\target\wasm32-unknown-unknown\release"

stellar contract deploy `
  --wasm "$targetDir\confession_anchor.wasm" `
  --network $network `
  --source $sourceKey

stellar contract deploy `
  --wasm "$targetDir\confession_registry.wasm" `
  --network $network `
  --source $sourceKey

stellar contract deploy `
  --wasm "$targetDir\reputation_badges.wasm" `
  --network $network `
  --source $sourceKey

stellar contract deploy `
  --wasm "$targetDir\anonymous_tipping.wasm" `
  --network $network `
  --source $sourceKey
```

Record the contract IDs printed by each command and save them manually in
`deployments\testnet.json` following the schema in
[DEPLOYMENT.md](./DEPLOYMENT.md#deployment-metadata).

---

## Summary

| Task | WSL 2 / Git Bash | Native PowerShell |
|---|---|---|
| Run `.sh` scripts | Yes (recommended) | No |
| `cargo build` | Yes | Yes |
| `stellar` CLI commands | Yes | Yes |
| `rustup target add` | Yes | Yes |
| Automated deployment script | Yes | Partial (manual steps above) |

For the smoothest experience on Windows, use WSL 2. For native PowerShell,
all individual `cargo` and `stellar` commands work, but you will need to run
deployment steps manually instead of via the bash convenience scripts.
