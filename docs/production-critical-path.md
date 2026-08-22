# Production critical path

This checklist covers the failure modes that blocked the first Vercel and Render deploys.

## Required deploy gates

Run these before promoting a deploy:

```bash
npm run deploy:preflight
npm run backend:build
npm run frontend:build
npm run contracts:verify-env
```

After deploy, run:

```bash
SMOKE_FRONTEND_URL=https://xconfess.vercel.app \
SMOKE_BACKEND_URL=https://xconfess-backend.onrender.com \
npm run deploy:smoke
```

Set `SMOKE_RUN_MUTATION=true` only when you want the smoke test to create a disposable registration account.

## API contract

The canonical browser-to-production auth path is:

| Browser route | Next.js proxy target | Backend route | Methods |
| --- | --- | --- | --- |
| `/api/users/register` | `BACKEND_API_URL/users/register` | `/api/users/register` | `POST` |
| `/api/auth/session` | `BACKEND_API_URL/auth/session` | `/api/auth/session` | `GET` |
| `/api/auth/session` | `BACKEND_API_URL/auth/me` | `/api/auth/me` | fallback `GET` |
| `/api/auth/session` | `BACKEND_API_URL/auth/login` | `/api/auth/login` | `POST` |

`BACKEND_API_URL` and `NEXT_PUBLIC_API_URL` must both point to the Render backend and include `/api`.
Never point either value at `https://xconfess.vercel.app/api`.

## Render schema policy

Production deploys must use migrations:

```env
TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=true
```

`TYPEORM_SYNCHRONIZE=true` is allowed only in local development. The backend now refuses to boot with production sync enabled.

Because the first Render database may have been created by TypeORM synchronize, Render runs `npm run render:prestart` before the backend starts. That script only baselines migrations when all of these are true:

- `TYPEORM_BASELINE_EXISTING_SCHEMA=true`
- `TYPEORM_MIGRATIONS_RUN=true`
- core tables already exist
- the `migrations` table is empty

Fresh databases skip the baseline and run migrations normally. Existing databases with migration history also skip it.

## Secrets

Generate production secrets with:

```bash
openssl rand -base64 48 # JWT_SECRET, APP_SECRET
openssl rand -hex 32    # CONFESSION_ENCRYPTION_KEY, ENCRYPTION_MASTER_KEY_v1
```

All-zero development keys are blocked. When `STELLAR_FEATURES_ENABLED=true` in production, `STELLAR_SERVER_SECRET` must be a valid Stellar secret seed.

## Free-tier runtime notes

Render free services can cold start slowly. The app uses `/api/health/ready` as the deploy health check so traffic is not routed until Postgres, Redis queues, and schema readiness pass. If background jobs are intentionally disabled, readiness reports them as `disabled`; production should keep `ENABLE_BACKGROUND_JOBS=true`.
