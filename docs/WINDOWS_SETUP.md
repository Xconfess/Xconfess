# Windows Local Setup Guide

This guide covers Windows-specific setup steps and common issues for XConfess development.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (required for PostgreSQL and Redis)
- [Node.js](https://nodejs.org/) ≥ 18 and npm ≥ 9
- [Git](https://git-scm.com/)
- [Rust](https://rustup.rs/) (only needed for contract work)

## Quick Start

### 1. Start Infrastructure (Docker Desktop)

Open **PowerShell** and run:

```powershell
docker compose -f compose.yaml up -d
```

Verify both containers are healthy:

```powershell
docker compose -f compose.yaml ps
```

**Note:** PostgreSQL is mapped to port **55432** on the host to avoid conflicts with a locally installed PostgreSQL on port 5432.

### 2. Install Dependencies

```powershell
npm install
```

### 3. Configure Environment

```powershell
copy xconfess-backend\.env.example xconfess-backend\.env
copy xconfess-frontend\.env.example xconfess-frontend\.env.local
```

Make sure `xconfess-backend\.env` contains `DB_PORT=55432` to match the Docker Compose mapping.

### 4. Start the Stack

```powershell
# Terminal 1: Backend
cd xconfess-backend && npm run start:dev

# Terminal 2: Frontend
cd xconfess-frontend && npm run dev
```

## Contract Development on Windows

Rust contract commands must be run from the `xconfess-contracts` working directory:

```powershell
cd xconfess-contracts

# Build
cargo build --target wasm32-unknown-unknown --release

# Test
cargo test --workspace
```

## Troubleshooting

### Docker Desktop not running

```powershell
# Start Docker Desktop (requires admin)
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# Wait for Docker to be ready, then:
docker compose -f compose.yaml up -d
```

### Port conflict (5432)

If you already have PostgreSQL installed locally, the Docker container uses port **55432** by default. Update `DB_PORT` in `xconfess-backend\.env`:

```powershell
# In xconfess-backend\.env
DB_PORT=55432
```

### "docker" not recognized

Ensure Docker Desktop is installed and the `docker` CLI is available in your PATH. After installing Docker Desktop, restart PowerShell.

### PowerShell execution policy

If scripts fail to run, set the execution policy:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Contract build fails on Windows

Use PowerShell and run cargo commands from the `xconfess-contracts` directory. If you encounter linker errors, install [Build Tools for Visual Studio](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with the "C++ build tools" workload.

## Additional Resources

- [Quick Start Guide](../QUICK_START.md)
- [Soroban Development Setup](SOROBAN_SETUP.md)
- [Demo Script](DEMO_SCRIPT.md)
