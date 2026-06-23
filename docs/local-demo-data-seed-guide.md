# Local Demo Data Seed Guide

## Overview

The `seed:demo` script populates a fresh database with realistic demo data for
local development, GrantFox demos, and contributor onboarding.

## Quick Start

```bash
# 1. Start PostgreSQL and Redis
docker compose up -d

# 2. Run migrations
npm run typeorm migration:run

# 3. Seed demo data
npm run seed:demo

# 4. Start the backend
npm run dev
```

## Demo Credentials

After seeding, log in with:

| Role    | Username      | Password        |
|---------|---------------|-----------------|
| Admin   | `demo-admin`  | `DemoAdmin123!` |
| User    | `demo-user`   | `DemoUser123!`  |

> These credentials are for local development only. No secrets are committed.

## What Gets Seeded

- **2 users** — 1 admin, 1 regular user (with encrypted email fields)
- **5 anonymous users** — linked to real users and unlinked
- **5 demo confessions** — with realistic content, gender, and tags
- **15+ reactions** — spread across confessions (❤️, 🤗, 👍, 💡, 🙏, 💪, 🎉, 🚀, 😢)
- **8 comments** — threaded discussions on confessions
- **5 tags** — advice, confession, question, story, support
- **3 sample tips** — verified Stellar tips on confessions

## Idempotency

The script is safe to re-run:

- **Users**: Skips if username already exists
- **Tags**: Skips if tag name already exists
- **Confessions**: Skips if message text already exists
- **Anonymous users**: Checks for existing links before creating

## Troubleshooting

### DB connection failure
Ensure `.env` has valid `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, and `DB_NAME`.
The script exits non-zero if any are missing or invalid.

### "relation does not exist"
Run migrations first: `npm run typeorm migration:run`

### No confessions visible in frontend
Make sure the backend is running and the frontend is pointed to the correct API URL.
