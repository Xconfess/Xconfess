# Database Backup Restore Verification

## Purpose

Continuously prove that a PostgreSQL backup can be restored into a disposable environment without exposing private data.

## Local command

```bash
npm run database:restore:verify
```

To verify a real sanitized backup:

```bash
npm run database:restore:verify -- --backup=/absolute/path/to/backup.sql
```

The restore uses Docker, an ephemeral PostgreSQL 16 container, and an isolated restore port. No private application data is written to the report.

## Checks

1. Preflight Docker availability.
2. Start disposable PostgreSQL and wait for readiness.
3. Restore the supplied backup or synthetic representative non-sensitive fixture.
4. Run migration metadata validation against the restored database.
5. Execute a post-restore health query.
6. Remove the disposable container and write a machine-readable report.

Reports are written to `artifacts/database-restore-verification.json` and contain status, failure stage, duration, timestamp, and boolean evidence only. They must not include SQL, credentials, row values, or private customer data.

## Continuous verification

CI runs the disposable restore verification on a schedule and on manual dispatch. Real backup credentials and files must be provided through a protected environment/secret mount; the scheduled job may use the non-sensitive synthetic fixture when no production snapshot can be safely copied.

## Failure remediation

- **Docker unavailable:** Install/start Docker or use a runner with Docker access.
- **Container/start or readiness failure:** Check runner resources and PostgreSQL image availability.
- **Restore failure:** Validate backup format, ownership, permissions, and restore compatibility in the incident evidence channel.
- **Migration metadata failure:** Compare migration files and database migration table; do not run broad schema changes against production until the disposable restore is fixed.
- **Health failure:** Stop application promotion, preserve the stage report, and escalate to the Database owner.

See the [Incident Rollback Runbook](./incident-rollback-runbook.md) for owner, escalation, evidence, and rollback boundaries.
