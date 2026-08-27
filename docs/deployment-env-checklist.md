# Deployment Environment Variable Checklist

> **One-stop reference for every environment variable required to deploy xConfess on [Render](https://render.com) (backend) and [Vercel](https://vercel.com) (frontend).**

Use this document alongside the interactive checklists at the bottom when setting up preview or production deployments.

---

## Table of Contents

- [How to Use This Checklist](#how-to-use-this-checklist)
- [Critical Warnings](#critical-warnings)
- [Render — Backend Environment Variables](#render--backend-environment-variables)
  - [Database](#database)
  - [Application](#application)
  - [Security & Encryption](#security--encryption)
  - [Email (SMTP)](#email-smtp)
  - [Redis & Rate Limiting](#redis--rate-limiting)
  - [Stellar / Blockchain](#stellar--blockchain-backend)
- [Vercel — Frontend Environment Variables](#vercel--frontend-environment-variables)
  - [API Connection](#api-connection)
  - [Stellar / Blockchain](#stellar--blockchain-frontend)
- [Stellar Testnet Reference IDs](#stellar-testnet-reference-ids)
- [Interactive Deployment Checklists](#interactive-deployment-checklists)
  - [Render (Backend)](#-render-backend-checklist)
  - [Vercel (Frontend)](#-vercel-frontend-checklist)
- [Validating Your Setup](#validating-your-setup)

---

## How to Use This Checklist

1. Copy `xconfess-backend/.env.sample` → `xconfess-backend/.env` and fill in all values.
2. Copy `xconfess-frontend/.env.local.sample` → `xconfess-frontend/.env.local` and fill in all values.
3. When deploying, add each variable to the platform dashboard (Render → Environment, Vercel → Settings → Environment Variables).
4. Run the preflight check before deploying:
   ```bash
   npm run deploy:preflight
   ```
5. Tick off items in the [interactive checklists](#interactive-deployment-checklists) below.

> **Secret values are described by format only — never commit real secrets to version control.**

---

## Critical Warnings

> [!WARNING]
> **`NEXT_PUBLIC_API_URL` (Vercel) must exactly match the deployed Render backend URL.**
> This variable is used in authentication, confession posting, reactions, and analytics.
> A mismatch causes **all API calls to silently fail** in production with no clear error in the UI.
> Example of a correct value: `https://xconfess-backend.onrender.com` (no trailing slash).

> [!WARNING]
> **`FRONTEND_URL` (Render) must exactly match the deployed Vercel frontend URL.**
> This variable controls CORS policy, WebSocket origin validation, and links in email notifications.
> If it is wrong, the frontend will be **blocked by CORS** and password-reset emails will link to the wrong domain.
> Example of a correct value: `https://xconfess.vercel.app` (no trailing slash).

> [!CAUTION]
> **Never expose `DEPLOYER_SECRET_KEY`, `JWT_SECRET`, `DB_PASSWORD`, `CONFESSION_AES_KEY`, or `EMAIL_ENCRYPTION_KEY` publicly.**
> These must only be set through the platform's secret environment variable settings — never in `.env` files committed to git.

---

## Render — Backend Environment Variables

These variables are set in the Render dashboard under **Environment → Environment Variables** for the backend web service. They are **never** exposed to the browser.

### Database

| Variable | Required | Format | Description |
|---|---|---|---|
| `DB_HOST` | ✅ | hostname string | PostgreSQL host. On Render, use the **Internal Database URL** hostname. |
| `DB_PORT` | ✅ | integer (e.g. `5432`) | PostgreSQL port. Default: `5432`. |
| `DB_USERNAME` | ✅ | string | Database username from Render Postgres. |
| `DB_PASSWORD` | ✅ | string (secret) | Database password from Render Postgres. |
| `DB_NAME` | ✅ | string | Database name from Render Postgres. |

> [!TIP]
> On Render, create a **PostgreSQL** resource first, then copy the connection details into these five variables. Use the **Internal Database URL** (not the external one) to avoid egress charges.

---

### Application

| Variable | Required | Format | Description |
|---|---|---|---|
| `PORT` | ✅ | integer (e.g. `5000`) | Port the NestJS server listens on. Render injects its own `PORT` automatically — set this to `5000` or leave it to Render. |
| `FRONTEND_URL` | ✅ ⚠️ | full URL, no trailing slash | The deployed Vercel frontend URL. Used for CORS, WebSocket origin checks, and email links. Example: `https://xconfess.vercel.app` |
| `NODE_ENV` | ✅ | `production` | Must be `production` in deployed environments to suppress dev-only features. |

---

### Security & Encryption

| Variable | Required | Format | Description |
|---|---|---|---|
| `JWT_SECRET` | ✅ | random string, 32+ characters | Signs and verifies JWT authentication tokens. Generate with: `openssl rand -base64 48` |
| `CONFESSION_AES_KEY` | ✅ | **exactly 32 characters** (hex or alphanumeric) | AES-256 key used to encrypt confession content. Generate with: `openssl rand -hex 16` |
| `EMAIL_ENCRYPTION_KEY` | ✅ | **exactly 32 characters** (string) | AES key used to encrypt email verification tokens. Generate with: `openssl rand -hex 16` |

> [!CAUTION]
> `CONFESSION_AES_KEY` and `EMAIL_ENCRYPTION_KEY` must each be **exactly 32 characters**. Shorter keys will cause a startup error. Longer keys will be silently truncated on some implementations, leading to decryption failures across deployments.

---

### Email (SMTP)

These are optional — if omitted, email features (password reset, welcome emails) will be disabled.

| Variable | Required | Format | Description |
|---|---|---|---|
| `MAIL_HOST` | optional | hostname | SMTP server host. Example: `smtp.sendgrid.net` |
| `MAIL_PORT` | optional | integer (e.g. `587`) | SMTP port. Common values: `587` (TLS), `465` (SSL), `25`. |
| `MAIL_SECURE` | optional | `"true"` or `"false"` | Set to `"true"` for port 465, `"false"` for 587. |
| `MAIL_USER` | optional | string | SMTP authentication username or API key identifier. |
| `MAIL_PASSWORD` | optional | string (secret) | SMTP authentication password or API key. |
| `MAIL_FROM` | optional | email address | The sender address shown in outgoing emails. Example: `noreply@xconfess.app` |

---

### Redis & Rate Limiting

Redis is used for BullMQ job queues (notifications, confession draft expiry). If omitted, queue features are disabled.

| Variable | Required | Format | Description |
|---|---|---|---|
| `REDIS_HOST` | optional | hostname | Redis server host. Example: `redis://red-xxxx.render.com` |
| `REDIS_PORT` | optional | integer (default: `6379`) | Redis server port. |
| `THROTTLE_TTL` | optional | integer, seconds (default: `900`) | Global rate limit window (15 minutes). |
| `THROTTLE_LIMIT` | optional | integer (default: `100`) | Max requests allowed per `THROTTLE_TTL` window. |
| `RATE_LIMIT_POST_MAX` | optional | integer (default: `5`) | Max POST requests per `RATE_LIMIT_POST_WINDOW`. Applies to confession creation. |
| `RATE_LIMIT_POST_WINDOW` | optional | integer, seconds (default: `60`) | Rolling window for POST rate limiting. |
| `RATE_LIMIT_GET_MAX` | optional | integer (default: `50`) | Max GET requests per `RATE_LIMIT_GET_WINDOW`. |
| `RATE_LIMIT_GET_WINDOW` | optional | integer, seconds (default: `60`) | Rolling window for GET rate limiting. |

---

### Stellar / Blockchain (Backend)

These are required only if you are enabling Soroban smart contract features (confession anchoring, tipping). See [`docs/SOROBAN_SETUP.md`](./SOROBAN_SETUP.md) for contract deployment instructions.

| Variable | Required | Format | Description |
|---|---|---|---|
| `STELLAR_NETWORK` | optional | `testnet` or `mainnet` | The Stellar network to connect to. Use `testnet` during development. |
| `STELLAR_HORIZON_URL` | optional | URL | Horizon API endpoint. See [Stellar Testnet Reference IDs](#stellar-testnet-reference-ids). |
| `STELLAR_SOROBAN_RPC_URL` | optional | URL | Soroban RPC endpoint for smart contract calls. |
| `STELLAR_NETWORK_PASSPHRASE` | optional | string | Network passphrase used to sign transactions. Must match the chosen network exactly. |
| `CONFESSION_ANCHOR_CONTRACT` | optional | 56-character string, starts with `C` | The deployed Soroban contract ID for the confession anchor. |
| `DEPLOYER_SECRET_KEY` | optional | 56-character string starting with `S` (secret) | Stellar keypair secret for deploying contracts. **Never commit this value.** |

---

## Vercel — Frontend Environment Variables

These variables are set in the Vercel dashboard under **Settings → Environment Variables**. Variables prefixed with `NEXT_PUBLIC_` are **bundled into the client-side JavaScript** and are visible in the browser — never put secrets here.

### API Connection

| Variable | Required | Format | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ ⚠️ | full URL, no trailing slash | The deployed Render backend URL. All API calls (auth, confessions, reactions) route through this. Example: `https://xconfess-backend.onrender.com` |
| `NEXT_PUBLIC_WS_URL` | optional | WebSocket URL | WebSocket server URL for real-time updates. Often the same host as `NEXT_PUBLIC_API_URL` but with `wss://` scheme. Example: `wss://xconfess-backend.onrender.com` |

> [!WARNING]
> `NEXT_PUBLIC_API_URL` is used in **7+ files** across the frontend codebase (auth, confessions API, analytics, profile, and more). An incorrect value breaks the entire app without a visible error — always verify it after deployment with the preflight script.

---

### Stellar / Blockchain (Frontend)

These are required only if enabling Stellar wallet features (Freighter, confession anchoring). They mirror the backend Stellar vars but are publicly exposed via `NEXT_PUBLIC_`.

| Variable | Required | Format | Description |
|---|---|---|---|
| `NEXT_PUBLIC_STELLAR_NETWORK` | optional | `testnet` or `mainnet` | Stellar network for the frontend SDK. Must match the backend `STELLAR_NETWORK`. |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | optional | URL | Horizon API URL for the frontend Stellar SDK. |
| `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL` | optional | URL | Soroban RPC URL for smart contract calls from the browser. |
| `NEXT_PUBLIC_STELLAR_CONTRACT_ID` | optional | 56-character string, starts with `C` | Confession anchor contract ID. Must match `CONFESSION_ANCHOR_CONTRACT` on the backend. |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | optional | string | Stellar network passphrase for transaction signing in the browser. |

> [!NOTE]
> Stellar `NEXT_PUBLIC_*` variables are safe to expose publicly — they reference public network endpoints and contract IDs, not secrets. Never add `DEPLOYER_SECRET_KEY` or any private key under `NEXT_PUBLIC_`.

---

## Stellar Testnet Reference IDs

Use these values when deploying to Stellar Testnet during development or preview deployments.

| Setting | Value |
|---|---|
| `STELLAR_NETWORK` / `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` |
| `STELLAR_HORIZON_URL` / `NEXT_PUBLIC_STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `STELLAR_SOROBAN_RPC_URL` / `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org:443` |
| `STELLAR_NETWORK_PASSPHRASE` / `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` |
| `CONFESSION_ANCHOR_CONTRACT` / `NEXT_PUBLIC_STELLAR_CONTRACT_ID` | Obtain after deploying — see [`SOROBAN_SETUP.md`](./SOROBAN_SETUP.md#deploy-to-stellar-testnet) |

> [!TIP]
> Fund your testnet deployer account for free using Friendbot:
> ```bash
> curl "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"
> ```

---

## Interactive Deployment Checklists

### 🟣 Render (Backend) Checklist

Use this before every Render deployment.

#### Database
- [ ] `DB_HOST` — set to the Render Postgres internal hostname
- [ ] `DB_PORT` — set (default `5432`)
- [ ] `DB_USERNAME` — set from Render Postgres credentials
- [ ] `DB_PASSWORD` — set from Render Postgres credentials (**secret**)
- [ ] `DB_NAME` — set from Render Postgres credentials

#### Application
- [ ] `PORT` — set (e.g. `5000`)
- [ ] `NODE_ENV` — set to `production`
- [ ] `FRONTEND_URL` — set to the **exact** Vercel URL (no trailing slash) ⚠️

#### Security & Encryption
- [ ] `JWT_SECRET` — set to a 32+ character random string (**secret**)
- [ ] `CONFESSION_AES_KEY` — set to a **exactly 32-character** string (**secret**)
- [ ] `EMAIL_ENCRYPTION_KEY` — set to an **exactly 32-character** string (**secret**)

#### Email (if using email features)
- [ ] `MAIL_HOST` — SMTP host
- [ ] `MAIL_PORT` — SMTP port
- [ ] `MAIL_SECURE` — `"true"` or `"false"`
- [ ] `MAIL_USER` — SMTP user
- [ ] `MAIL_PASSWORD` — SMTP password (**secret**)
- [ ] `MAIL_FROM` — sender address

#### Redis (if using job queues)
- [ ] `REDIS_HOST` — Redis host
- [ ] `REDIS_PORT` — Redis port (default `6379`)

#### Stellar (if using blockchain features)
- [ ] `STELLAR_NETWORK` — `testnet` or `mainnet`
- [ ] `STELLAR_HORIZON_URL` — Horizon endpoint
- [ ] `STELLAR_SOROBAN_RPC_URL` — Soroban RPC endpoint
- [ ] `STELLAR_NETWORK_PASSPHRASE` — network passphrase (exact string)
- [ ] `CONFESSION_ANCHOR_CONTRACT` — 56-char contract ID starting with `C`

#### Final Steps
- [ ] Ran `npm run deploy:preflight` locally — all checks pass ✅
- [ ] Verified `FRONTEND_URL` matches the live Vercel URL ⚠️
- [ ] Confirmed no secrets are committed in `.env` files

---

### 🔺 Vercel (Frontend) Checklist

Use this before every Vercel deployment.

#### API Connection
- [ ] `NEXT_PUBLIC_API_URL` — set to the **exact** Render backend URL (no trailing slash) ⚠️
- [ ] `NEXT_PUBLIC_WS_URL` — set if using real-time notifications

#### Stellar (if using blockchain features)
- [ ] `NEXT_PUBLIC_STELLAR_NETWORK` — matches backend `STELLAR_NETWORK`
- [ ] `NEXT_PUBLIC_STELLAR_HORIZON_URL` — Horizon endpoint
- [ ] `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL` — Soroban RPC endpoint
- [ ] `NEXT_PUBLIC_STELLAR_CONTRACT_ID` — matches backend `CONFESSION_ANCHOR_CONTRACT`
- [ ] `NEXT_PUBLIC_NETWORK_PASSPHRASE` — network passphrase (exact string)

#### Final Steps
- [ ] Ran `npm run deploy:preflight` locally — all checks pass ✅
- [ ] Verified `NEXT_PUBLIC_API_URL` responds at `<url>/` in a browser ⚠️
- [ ] Confirmed no `NEXT_PUBLIC_` variables contain secret keys or passwords

---

## Validating Your Setup

Run the preflight script from the project root:

```bash
npm run deploy:preflight
```

This script checks that:
- All required variables are present in your local `.env` files
- `CONFESSION_AES_KEY` and `EMAIL_ENCRYPTION_KEY` are exactly 32 characters
- `NEXT_PUBLIC_API_URL` and `FRONTEND_URL` use `https://` (in production mode)
- Stellar contract IDs are 56 characters and start with `C`
- No placeholder values like `CHANGE_ME_*` remain

Example output:
```
xConfess Deploy Preflight Check
================================

Backend (.env)
  ✅ DB_HOST
  ✅ DB_PORT
  ✅ DB_USERNAME
  ✅ DB_PASSWORD
  ✅ DB_NAME
  ✅ JWT_SECRET
  ✅ PORT
  ✅ FRONTEND_URL
  ✅ CONFESSION_AES_KEY  (32 chars ✓)
  ✅ EMAIL_ENCRYPTION_KEY  (32 chars ✓)

Frontend (.env.local)
  ✅ NEXT_PUBLIC_API_URL

================================
All checks passed. Safe to deploy! 🚀
```

---

*For Soroban contract deployment instructions, see [`docs/SOROBAN_SETUP.md`](./SOROBAN_SETUP.md).*
*For general project setup, see the [README](../README.md).*
