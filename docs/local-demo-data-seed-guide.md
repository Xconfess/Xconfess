# Local Demo Data Seed Guide

This guide explains how to seed your local development environment with demo data for GrantFox demos and contributor onboarding.

## Prerequisites

- Backend services running (`docker compose up` or equivalent)
- Database migrations applied (`npm run migrate --workspace=xconfess-backend`)

## Quick Start

```bash
# From the repo root:
npm run seed:demo --workspace=xconfess-backend
```

This is safe to re-run — it uses upsert logic and will not create duplicate data.

## Seeded Data

| Type | Count | Details |
|------|-------|---------|
| Admin user | 1 | `wave-admin@example.com` (role: admin) |
| Regular users | 3 | Various activity levels |
| Confessions | 12 | Mix of public, anonymous, and anchored |
| Reactions | 84+ | Distributed across confessions |
| Comments | 15 | Nested threads on popular confessions |
| Sample tips | 3 | Demonstrates tipping flow |

## Credentials

- **Admin**: `wave-admin@example.com` (password set at seed time, check console output)
- **User**: `demo-user@example.com` (password: `demo-password`)

> ⚠️ These credentials are for local development only. Never commit real passwords.

## Troubleshooting

- **Connection refused**: Ensure PostgreSQL/Redis are running
- **Duplicate key error**: The seed script handles this automatically via upsert
- **Empty feed after seed**: Hard refresh the browser or clear browser cache
