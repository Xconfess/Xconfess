# XConfess Deployment

This repo deploys as two apps plus managed services:

- `xconfess-backend`: NestJS API on port `5000`.
- `xconfess-frontend`: Next.js app on port `3000`.
- PostgreSQL: required.
- Redis: required when `ENABLE_BACKGROUND_JOBS=true`..

## Local Smoke Start

From the repo root:

```powershell
npm install
docker compose up -d postgres redis
npm run dev:backend
npm run dev:frontend
```

Backend liveness:

```powershell
Invoke-WebRequest -Uri http://localhost:5000/api/health/live -UseBasicParsing
```

Backend readiness:

```powershell
Invoke-WebRequest -Uri http://localhost:5000/api/health/ready -UseBasicParsing
```

If Docker says the `dockerDesktopLinuxEngine` pipe does not exist, start Docker Desktop and make sure it is using Linux containers.

## Production Environment

Never deploy the local `.env` values. Generate real secrets and put them in your hosting provider's secret manager.

Required backend variables:

```env
NODE_ENV=production
APP_ENV=production
PORT=5000
FRONTEND_URL=https://your-frontend-domain
BACKEND_URL=https://your-backend-domain

DB_HOST=your-postgres-host
DB_PORT=5432
DB_USERNAME=your-postgres-user
DB_PASSWORD=your-postgres-password
DB_NAME=your-postgres-database
DB_READ_HOST=
DB_READ_PORT=
TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=true

JWT_SECRET=generate-a-strong-32-plus-character-secret
APP_SECRET=generate-a-strong-32-plus-character-secret
CONFESSION_ENCRYPTION_KEY=64-hex-characters
ENCRYPTION_CURRENT_KEY_VERSION=v1
ENCRYPTION_MASTER_KEY_v1=64-hex-characters

ENABLE_BACKGROUND_JOBS=true
REDIS_HOST=your-redis-host
REDIS_PORT=6379

STELLAR_FEATURES_ENABLED=false
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-rpc-testnet.stellar.org
CONFESSION_ANCHOR_CONTRACT_ID=CB5XMDHT66EISB4WXM4YGNDHYRMZDX42TOHZEAENIUTSSMRFHJSFRNHB
REPUTATION_BADGES_CONTRACT_ID=CDAN4HZHY6XNQR3TRPLPJKVKNURVMMQMF7XNZ6AUNJNFLR77J4DNAEYI
TIPPING_SYSTEM_CONTRACT_ID=CC74UWNAAYDTPEPVKR4CPANWJSF6GI2PCI7BLN6M46KB6CSQYVYLHIWM
STELLAR_SERVER_SECRET=

MAIL_HOST=your-smtp-host
MAIL_PORT=587
MAIL_SECURE=false
MAIL_FROM=noreply@your-domain
MAIL_USER=your-smtp-user
MAIL_PASSWORD=your-smtp-password
```

Staging uses the same shape with staging hosts and isolated staging databases:

```env
NODE_ENV=production
APP_ENV=staging
PORT=5000
FRONTEND_URL=https://staging.your-frontend-domain
BACKEND_URL=https://staging.your-backend-domain
DB_HOST=staging-postgres-host
DB_PORT=5432
DB_USERNAME=staging-app-user
DB_PASSWORD=staging-db-password
DB_NAME=xconfess_staging
JWT_SECRET=staging-strong-secret
APP_SECRET=staging-strong-secret
CONFESSION_ENCRYPTION_KEY=64-hex-characters
TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=true
ENABLE_BACKGROUND_JOBS=true
REDIS_HOST=staging-redis-host
REDIS_PORT=6379
```

Required frontend variables:

```env
BACKEND_API_URL=https://your-backend-domain/api
NEXT_PUBLIC_API_URL=https://your-backend-domain/api
NEXT_PUBLIC_WS_URL=wss://your-backend-domain
NEXT_PUBLIC_APP_URL=https://your-frontend-domain
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_CONTRACT_ID=CB5XMDHT66EISB4WXM4YGNDHYRMZDX42TOHZEAENIUTSSMRFHJSFRNHB
NEXT_PUBLIC_DEV_BYPASS_AUTH=false
```

Generate backend secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the base64 values for `JWT_SECRET` and `APP_SECRET`. Use the 64-character hex value for `CONFESSION_ENCRYPTION_KEY`.

## Container Deployment

Build backend:

```powershell
docker build -f Dockerfile.backend -t xconfess-backend .
```

Build frontend:

```powershell
docker build -f Dockerfile.frontend -t xconfess-frontend `
  --build-arg BACKEND_API_URL=https://your-backend-domain/api `
  --build-arg NEXT_PUBLIC_API_URL=https://your-backend-domain/api `
  --build-arg NEXT_PUBLIC_WS_URL=wss://your-backend-domain `
  --build-arg NEXT_PUBLIC_APP_URL=https://your-frontend-domain .
```

Start the backend only after Postgres and Redis are reachable. The backend exposes `/api/health/live` for process health and `/api/health/ready` for dependency readiness.

## SSH/PM2 Deployment Order

Deploy backend first, then frontend.

1. Sync `xconfess-backend`.
2. Write the backend `.env`.
3. Run `npm ci --omit=dev`.
4. Restart `xconfess-backend` with PM2.
5. Verify `http://localhost:5000/api/health/ready` on the server.
6. Sync `xconfess-frontend`.
7. Run `npm ci --omit=dev`.
8. Restart `xconfess-frontend` with PM2.

The CD workflow follows this order and stops before frontend deployment if backend readiness fails.

## Rollback Runbook

Find the last successful deployment:

```powershell
gh run list --workflow cd.yml --status success --limit 10
```

Roll backend back first by rerunning CD against the previous known-good commit SHA, or by SSHing into the host and restoring the previous `~/xconfess/backend/dist` directory.

```powershell
gh workflow run cd.yml --ref <previous-good-sha> -f environment=production -f run_build=true
```

After the backend is restored, verify readiness:

```powershell
ssh <deploy-user>@<deploy-host> "curl -sf http://localhost:5000/api/health/ready"
```

Then roll frontend back to the matching commit or restore the previous `~/xconfess/frontend/.next` directory. Smoke check public routes after PM2 reload:

```powershell
Invoke-WebRequest -Uri https://your-frontend-domain -UseBasicParsing
Invoke-WebRequest -Uri https://your-frontend-domain/login -UseBasicParsing
Invoke-WebRequest -Uri https://your-frontend-domain/register -UseBasicParsing
```

## CI/CD Gates

Fast deploy gate for app hosts:

```powershell
npm run ci:apps
```

Full repo gate:

```powershell
npm run ci
```

The full gate includes frontend type-checking, frontend tests, backend tests, and Rust contract tests. Contract tests need enough free disk space for the MSVC linker on Windows.
