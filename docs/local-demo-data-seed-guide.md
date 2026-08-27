# Local Demo Data Seed Guide

## Overview

Use this guide to prepare local data for the Wave 5 walkthrough in
[`docs/DEMO_SCRIPT.md`](./DEMO_SCRIPT.md). The repository does not currently
include a one-shot demo seed script, so prepare the dataset with the local
stack, the UI, and the existing backend API/database surfaces listed below.

Keep all data local and disposable. Do not use production exports, real user
content, live private keys, or private URLs in demo records.

## Prerequisites

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Start Postgres and Redis from the repository root:

   ```bash
   docker compose -f compose.yaml up -d
   docker compose -f compose.yaml ps
   ```

3. Copy local environment files:

   ```bash
   cp xconfess-backend/.env.example xconfess-backend/.env
   cp xconfess-frontend/.env.example xconfess-frontend/.env.local
   ```

   `xconfess-backend/.env.example` already points at the local Postgres
   container on `localhost:55432` and sets `TYPEORM_SYNCHRONIZE=true` for
   disposable local schema setup. For migration-based setup, use
   `xconfess-backend/data-source.ts` and the migrations in
   `xconfess-backend/migrations/`.

4. Boot the app:

   ```bash
   npm run dev
   ```

5. Smoke-test the running stack:

   ```bash
   ./scripts/smoke-test.sh
   ```

## Running Seed Scripts

There is no dedicated demo-data seed command in `package.json` or
`xconfess-backend/package.json` at the time of writing. Relevant existing
helpers are:

- `compose.yaml` for local Postgres and Redis.
- `xconfess-backend/.env.example` for local database and Redis settings.
- `xconfess-backend/data-source.ts` plus `xconfess-backend/migrations/` for
  TypeORM migration setup.
- `scripts/smoke-test.sh` for confirming the local frontend and backend are up.
- Backend Swagger at `http://localhost:5000/api/api-docs` after the backend
  starts.

For a clean local demo, reset the Docker volume if needed, then recreate the
schema with `TYPEORM_SYNCHRONIZE=true` in `xconfess-backend/.env`.

## Minimum Demo Dataset

Prepare at least:

| Area          | Minimum records                                               | How to create                                                                                |
| ------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Users         | 1 regular user, 1 admin user                                  | UI/API, then promote admin locally in DB                                                     |
| Confessions   | 3 visible confessions with distinct text and tags             | UI or `POST /api/confessions`                                                                |
| Reactions     | 2 reactions on one confession and 1 reaction on another       | UI or `POST /api/reactions`                                                                  |
| Comments      | 2 top-level comments and 1 reply                              | UI or `POST /api/comments/:confessionId`                                                     |
| Reports       | 1 pending report tied to a visible confession                 | UI or report API                                                                             |
| Notifications | 2 notifications for the regular user, one unread and one read | Direct DB insert                                                                             |
| Tips          | 1 verified or pending local tip tied to a confession          | Direct DB insert, or `POST /api/confessions/:id/tips/verify` with a real testnet transaction |

## UI-Created Data

Use the UI for the records that the Wave 5 demo is meant to exercise directly:

1. Register or log in as a regular user at `http://localhost:3000`.
2. Create at least three confessions from the composer.
3. Add reactions from the feed or confession detail page.
4. Add comments and one nested reply from a confession detail page.
5. Report one confession from the regular user session.
6. Register or log in as the future admin user.

Promote the admin user only in your local database:

```sql
UPDATE "user"
SET role = 'admin'
WHERE username = 'wave5_admin';
```

Log back in as that user before opening the admin reports walkthrough.

## API-Created Data

The same demo records can be created through the backend API when the backend is
running at `http://localhost:5000`. Use throwaway local emails and passwords.

Register and log in:

```bash
curl -s -X POST http://localhost:5000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"wave5-user@example.test","password":"local-demo-pass","username":"wave5_user"}'

curl -s -X POST http://localhost:5000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"wave5-user@example.test","password":"local-demo-pass"}'
```

Save the returned `access_token` and `anonymousUserId` for authenticated
comment requests and anonymous reaction/report requests.

Create confessions:

```bash
curl -s -X POST http://localhost:5000/api/confessions \
  -H "Content-Type: application/json" \
  -d '{"message":"Wave 5 demo confession about launch nerves.","gender":"other","tags":["wave5","demo"]}'
```

Create reactions:

```bash
curl -s -X POST http://localhost:5000/api/reactions \
  -H "Content-Type: application/json" \
  -d '{"confessionId":"<confession-id>","anonymousUserId":"<anonymous-user-id>","emoji":"like"}'
```

Create comments:

```bash
curl -s -X POST http://localhost:5000/api/comments/<confession-id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access-token>" \
  -d '{"content":"This is a local Wave 5 demo comment.","anonymousContextId":"<anonymous-user-id>"}'
```

Create a report through the direct backend endpoint:

```bash
curl -s -X POST http://localhost:5000/api/reports \
  -H "Content-Type: application/json" \
  -d '{"confessionId":"<confession-id>","type":"spam","reason":"Local demo report for admin review."}'
```

For the frontend proxy path, use `POST /api/confessions/<id>/report` on
`localhost:3000`; it forwards to the backend report flow and requires either an
authorization header or `x-anonymous-user-id`.

Tips can be verified through:

```bash
curl -s -X POST http://localhost:5000/api/confessions/<confession-id>/tips/verify \
  -H "Content-Type: application/json" \
  -d '{"txId":"<64-character-testnet-transaction-hash>"}'
```

Use a real Stellar testnet transaction for that endpoint. If the walkthrough
only needs the UI to show local tip state, create the tip row directly in the
local database instead.

## Direct Database Data

Use direct database inserts for records that are difficult to trigger reliably
from the UI during setup:

- `notifications`: create one unread and one read notification for the regular
  user. Valid local types are `new_message`, `message_batch`, and `system`.
- `tips`: create a local `pending` or `verified` row if you do not have a real
  Stellar testnet transaction to verify through the API.
- Admin promotion: update the local user row to `role = 'admin'`.

Connect to the local database with any Postgres client using:

```text
host=localhost port=55432 dbname=xconfess user=postgres password=postgres
```

Before the walkthrough, verify that the key tables have records:

```sql
SELECT count(*) FROM anonymous_confessions;
SELECT count(*) FROM reaction;
SELECT count(*) FROM comments;
SELECT count(*) FROM reports;
SELECT count(*) FROM notifications;
SELECT count(*) FROM tips;
```

## Troubleshooting

- If tables are missing, confirm `TYPEORM_SYNCHRONIZE=true` in
  `xconfess-backend/.env` for a disposable local database, then restart the
  backend.
- If comments fail with `401`, log in again and pass the latest bearer token.
- If reactions or frontend report submissions fail with a missing anonymous
  user, log in through `/api/users/login` and pass the returned
  `anonymousUserId`.
- If notification or export features look unhealthy, make sure Redis is running
  from `compose.yaml`.
