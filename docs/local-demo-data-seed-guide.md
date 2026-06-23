# Local Demo Data Seed Guide

## Overview

The `npm run seed:demo` script populates your local PostgreSQL database with
realistic demo data for development and presentation purposes. It is fully
**idempotent** — safe to run multiple times without creating duplicates.

## Prerequisites

- PostgreSQL running locally (or via Docker)
- `.env` configured with valid `DB_HOST`, `DB_PORT`, `DB_USERNAME`,
  `DB_PASSWORD`, `DB_NAME`
- Dependencies installed (`npm install`)

## Usage

```bash
cd xconfess-backend
npm run seed:demo
```

The script will:

1. Connect to the configured PostgreSQL database
2. Upsert demo users (admin + regular)
3. Create anonymous user identities linked to those accounts
4. Seed 5 demo confessions with varied content
5. Add emoji reactions to each confession
6. Add comments on each confession
7. Create demo tips on the first 3 confessions
8. Print a summary with credentials

**Exit codes:**
- `0` — Success
- `1` — Database connection failure or unhandled error

## Demo Credentials

After running the seed script, use these credentials to log in:

| Role    | Username      | Password        |
|---------|---------------|-----------------|
| Admin   | `demo-admin`  | `DemoAdmin!2026` |
| User    | `demo-user`   | `DemoUser!2026` |

> ⚠️ These credentials are for **local development only**. They are
> intentionally simple and must never be used in production.

## What Gets Seeded

| Entity           | Count | Notes                                      |
|------------------|-------|---------------------------------------------|
| Users            | 2     | 1 admin, 1 regular user                     |
| Anonymous users  | 2     | Linked to the two demo users                |
| Confessions      | 5     | Varied content, genders, and authors        |
| Reactions        | ~10-15| Random emojis from ❤️ 😂 🔥 👏 😢            |
| Comments         | ~5-15 | Distributed across confessions              |
| Tips             | ~3-6  | On first 3 confessions, random XLM amounts  |

## Idempotency

The script uses PostgreSQL `ON CONFLICT` upsert patterns:

- **Users** — upserted by `username` (unique constraint)
- **Anonymous users** — `ON CONFLICT DO NOTHING`
- **Confessions** — `ON CONFLICT DO NOTHING` (deterministic UUIDs)
- **Reactions** — `ON CONFLICT DO NOTHING`
- **Comments** — `ON CONFLICT DO NOTHING`
- **Tips** — upserted by `tx_id` (unique constraint)

Re-running the script refreshes passwords and user data but will not
duplicate confessions, reactions, comments, or tips.

## Troubleshooting

### Database connection failure

```
❌ Database connection failed — cannot run seed script.
```

Ensure your `.env` has correct DB credentials and PostgreSQL is running:

```bash
# Check if PostgreSQL is reachable
pg_isready -h localhost -p 5432
```

### TypeORM entity not found

Make sure you run the script from the `xconfess-backend` directory so that
the relative path `../src/**/*.entity{.ts,.js}` resolves correctly.

### Email encryption errors

The script uses the `EMAIL_ENCRYPTION_KEY` environment variable (or a
default dev key). Ensure it is set to a 32-byte hex string if you need
to decrypt seeded email addresses.
