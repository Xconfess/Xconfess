# Zero-Downtime Search Index Migration Runbook

This document describes how to add or update full-text search support for `anonymous_confessions` without taking xConfess offline.

## Goals

- Avoid downtime for the public API and admin operations
- Ensure the application can continue serving queries while PostgreSQL schema changes are applied
- Validate readiness before routing production traffic to the updated deployment
- Protect search index changes with a health gate that rejects incomplete migrations

## Key components

- `MigrationVerificationService` in `xconfess-backend/src/database/migration-verification.service.ts`
- `SchemaReadinessHealthIndicator` in `xconfess-backend/src/health/schema.readiness.health.ts`
- `/api/health/ready` readiness probe that includes schema verification for `anonymous_confessions`

## Recommended migration path

1. Add new columns and indexes in a non-blocking way

   - Create a migration that adds nullable columns such as `search_vector` and `view_count`.
   - Add any required indexes using `CREATE INDEX CONCURRENTLY` so PostgreSQL can build them without locking writes.
   - Do not remove or change existing query paths until the new schema is fully backfilled and validated.

2. Backfill the new search fields

   - Populate `search_vector` for existing rows using a standalone backfill script or a background job.
   - Calculate `view_count` as needed before switching query behavior to use the new field.
   - Ensure the application writes to the new columns for all subsequent updates.

3. Validate with readiness probes

   - The backend readiness probe will return `schema: down` if any required columns or indexes are missing.
   - This is intentional: `search_vector` and the required indexes are optional for correctness but required for production search performance.
   - Before promoting traffic, verify:
     - `curl -s http://localhost:3000/api/health/ready | jq .status` returns `"ok"`
     - the `schema` section shows `status: up`

4. Switch traffic gradually

   - Deploy the new backend version behind a load balancer or routing layer.
   - Use canary or phased rollout if available.
   - Keep the old search implementation alive until the new index and query path are confirmed.

5. Confirm observability and rollback readiness

   - Monitor query latency and error rates for search endpoints.
   - Ensure alerts are ready for any degradation after the schema migration.
   - Have a rollback plan that can revert to the prior code path if necessary.

## How the backend enforces search readiness

The backend checks `anonymous_confessions` schema readiness by querying PostgreSQL metadata:

- Required columns:
  - `search_vector`
  - `view_count`
- Required indexes:
  - `idx_confession_search_vector`
  - `idx_confession_created_at`

If any column or index is missing, `SchemaReadinessHealthIndicator` fails the probe and returns structured details about what is absent.

## When to use this runbook

Use this runbook when deploying changes that affect search, sorting, or database indexes on `anonymous_confessions`. It is especially important for changes that add or migrate large indexes, because the readiness probe helps prevent a performance regression from reaching production.
