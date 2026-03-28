## DLQ Retention Policy & Cleanup

The notification dead-letter queue (DLQ) is now protected by a retention policy and scheduled cleanup job.

### Configuration

Set these environment variables (or override in config):

- `DLQ_RETENTION_DAYS` (default: 14) — How many days to retain failed jobs
- `DLQ_CLEANUP_BATCH_SIZE` (default: 100) — Max jobs to process per cleanup run
- `DLQ_CLEANUP_DRY_RUN` (default: false) — If true, cleanup only logs candidates

### How it works

- Every 6 hours, the backend scans the DLQ for jobs older than the retention window.
- In dry-run mode, it logs which jobs would be deleted.
- In active mode, it deletes jobs and emits an audit log entry for each batch.
- Cleanup is idempotent and safe to rerun.

#### Manual Cleanup

You can trigger cleanup manually in code:

```ts
// In a service/controller:
await notificationQueue.cleanupDlq({ dryRun: true }); // or dryRun: false
```

#### Audit Logging

All cleanup activity is logged in the audit log with action type `NOTIFICATION_DLQ_CLEANUP`.

# xConfess Backend

For operational details on managing email templates and rollouts, see the [Template Rollout Runbook](../docs/template-rollout-runbook.md).

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

> NestJS-based backend for the xConfess anonymous confession platform.

## Auth Endpoint Split (`/users/*` vs `/auth/*`)

Both route groups are active in this codebase:

- `/api/users/*`: user lifecycle endpoints (`register`, `login`, `profile`, account status, user notification preferences)
- `/api/auth/*`: auth-centric endpoints (`login`, `me`, `logout`, password reset flow)

Examples:

- `POST /api/users/register`
- `POST /api/users/login`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

## Active Modules

| Module        | Path                 | Description                                            |
| ------------- | -------------------- | ------------------------------------------------------ |
| Auth          | `src/auth/`          | JWT authentication, guards, decorators                 |
| User          | `src/user/`          | User + anonymous user management                       |
| Confession    | `src/confession/`    | Confession CRUD, search, tags, encryption              |
| Reaction      | `src/reaction/`      | Emoji reactions with WebSocket                         |
| Comment       | `src/comment/`       | Nested commenting system                               |
| Messages      | `src/messages/`      | Anonymous messaging (author-reply)                     |
| Report        | `src/report/`        | Report creation & resolution                           |
| Admin         | `src/admin/`         | Admin panel with RBAC                                  |
| Moderation    | `src/moderation/`    | AI content moderation (OpenAI)                         |
| Audit Log     | `src/audit-log/`     | Comprehensive audit trail                              |
| Logger        | `src/logger/`        | Structured logging with PII masking                    |
| Stellar       | `src/stellar/`       | Stellar blockchain integration                         |
| Tipping       | `src/tipping/`       | XLM micro-tipping                                      |
| Encryption    | `src/encryption/`    | Field-level confession encryption                      |
| Cache         | `src/cache/`         | Redis/in-memory caching                                |
| Analytics     | `src/analytics/`     | View counts, trending                                  |
| Data Export   | `src/data-export/`   | GDPR data export                                       |
| WebSocket     | `src/websocket/`     | Real-time event gateway                                |
| Notification (outbox/DLQ replay) | `src/notification/` | Active notification queue, replay, and retention cleanup |
| Notifications (Bull queue APIs) | `src/notifications/` | Additional notification endpoints and DLQ admin queue tooling |

## Background Job Requirements

Redis-backed Bull queues are required for background-job features. In particular:

- `src/notifications/notifications.module.ts` explicitly owns `notifications` and `notifications-dlq`
- `src/data-export/data-export.module.ts` explicitly owns `export-queue`

If Redis-backed background jobs are enabled, the backend must be able to bootstrap those queue tokens or the related processors and services will fail to initialize.

## Project Setup

```bash
npm install
```

## Compile and Run

```bash
# development
npm run start:dev

# production mode
npm run build
npm run start:prod
```

## Run Tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## Environment Variables

Copy `.env.example` to `.env` and update the values:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=xconfess
JWT_SECRET=your-secret-key
PORT=5000
NODE_ENV=development
APP_ENV=local
TYPEORM_SYNCHRONIZE=false
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
```

### TypeORM Synchronize Policy

- Default is `false` in all environments.
- Sync is enabled only when both conditions are true:
  - environment is local/dev (`NODE_ENV` or `APP_ENV` is `local`/`dev`/`development`)
  - `TYPEORM_SYNCHRONIZE=true`
- In non-dev environments, schema sync remains disabled even if the flag is set.

## Database Migrations

Migrations are the authoritative schema-evolution mechanism for non-dev environments.

```bash
# generate a migration from local entity changes
npm run migration:generate -- ./migrations/<migration-name>

# apply pending migrations
npm run migration:run

# revert the latest migration (if needed)
npm run migration:revert
```

## API Documentation

When running locally, Swagger docs are available at `/api/api-docs`.

For the exact controller-derived route list and DTO-accurate payload examples, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

## 📄 License

[MIT licensed](../LICENSE)
