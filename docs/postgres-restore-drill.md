# PostgreSQL Restore Drill

Verifies, on a schedule, that backups are actually recoverable by restoring
into an **isolated** environment. The drill never touches production data and
records duration and outcome so recovery confidence is measurable.

The drill is implemented as `scripts/postgres-restore-drill.sh`, with tests in
`scripts/__tests__/postgres-restore-drill.test.sh`.

---

## 1. Goal

Prove, on a schedule, that a PostgreSQL backup can be restored and pass
integrity checks — before an incident forces us to find out under pressure.

---

## 2. Usage

```bash
XCONFESS_RESTORE_TARGET=postgresql://user:pass@isolated-host/drill-db \
XCONFESS_BACKUP_FILE=/path/to/backup.dump \
  bash scripts/postgres-restore-drill.sh
```

Required variables:

| Variable | Meaning |
| --- | --- |
| `XCONFESS_RESTORE_TARGET` | Connection target (MUST be an isolated environment) |
| `XCONFESS_BACKUP_FILE` | Path to the backup artifact to restore |

Optional variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `XCONFESS_DRILL_REPORT` | `./restore-drill-report.log` | Where the drill report is written |
| `XCONFESS_PROD_MARKER` | `prod` | Substring that marks a production target |

Run the tests:

```bash
bash scripts/__tests__/postgres-restore-drill.test.sh
```

---

## 3. Frequency

- [ ] Run the drill on a **scheduled cadence** (e.g. weekly) using CI or a
      scheduled job, not ad hoc.
- [ ] Record the last successful drill date and keep it visible (e.g. a badge
      or a comment in the ops dashboard).

---

## 4. Isolation (non-negotiable)

- [ ] Restore into a **dedicated isolated environment** (throwaway database or
      schema), never into the production database or its replicas.
- [ ] Confirm the restore target is not reachable by production traffic.
- [ ] Use a separate connection string that points at the isolated target.
- [ ] **Never** overwrite production data — the drill is read-only with respect
      to production.

---

## 5. Procedure

1. [ ] Fetch the latest backup artifact.
2. [ ] Restore it into the isolated target:
       `pg_restore --no-owner --clean --dbname <isolated-db> <backup-file>`
3. [ ] Run integrity checks:
   - [ ] Row counts on key tables match expectations.
   - [ ] A representative query (e.g. recent confessions feed) returns data.
   - [ ] Foreign-key / constraint validation completes without errors.
4. [ ] Record the **duration** and **outcome** (success/failure + any errors).

---

## 6. Failure Handling

- [ ] If the restore fails, file a follow-up issue and do **not** mark the
      drill as passed.
- [ ] Log only sanitized error output — no credentials or connection strings.
- [ ] A failed drill must surface to the ops channel, not fail silently.

---

## 7. Reporting

- [ ] Record, per drill: backup date, restore duration, outcome, and the
      checksum/identifier of the restored artifact.
- [ ] Keep the record outside production logs if it contains identifiers.

---

## 8. Failure Safety

- The drill must fail safe: any unexpected write to the production database is
  a hard stop. Use a read-only role for the isolated restore where possible.
- The script refuses to run when the target looks like production (default
  marker `prod`), and its report never logs credentials or connection strings.
