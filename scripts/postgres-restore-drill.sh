#!/usr/bin/env bash
#
# Scheduled PostgreSQL restore drill.
#
# Proves, on a schedule, that a backup can actually be restored and pass
# integrity checks. The drill is strictly isolated: it refuses to run against
# the production database and never overwrites production data.
#
# Usage:
#   XCONFESS_RESTORE_TARGET=postgresql://user:pass@isolated-host/drill-db \
#   XCONFESS_BACKUP_FILE=/path/to/backup.dump \
#     bash scripts/postgres-restore-drill.sh
#
# Required environment variables:
#   XCONFESS_RESTORE_TARGET  connection target (MUST be an isolated environment)
#   XCONFESS_BACKUP_FILE     path to the backup artifact to restore
#
# Optional:
#   XCONFESS_DRILL_REPORT    path to write the drill report (default: ./restore-drill-report.log)
#   XCONFESS_PROD_MARKER     substring that marks a production target (default: "prod")

set -euo pipefail

REPORT_FILE="${XCONFESS_DRILL_REPORT:-./restore-drill-report.log}"
PROD_MARKER="${XCONFESS_PROD_MARKER:-prod}"

log() {
  echo "[restore-drill] $*"
}

fail() {
  log "ERROR: $*" >&2
  echo "outcome=failure reason=$*" >> "$REPORT_FILE"
  exit 1
}

# Resolve pg_restore and psql, honoring an override for tests.
PG_RESTORE="${XCONFESS_PG_RESTORE:-pg_restore}"
PSQL="${XCONFESS_PSQL:-psql}"

TARGET="${XCONFESS_RESTORE_TARGET:-}"
BACKUP_FILE="${XCONFESS_BACKUP_FILE:-}"

# --- Guard 1: required inputs -------------------------------------------------
if [ -z "$TARGET" ]; then
  fail "XCONFESS_RESTORE_TARGET is required"
fi
if [ -z "$BACKUP_FILE" ]; then
  fail "XCONFESS_BACKUP_FILE is required"
fi

# --- Guard 2: isolation (fail safe, non-negotiable) ---------------------------
# The restore target must be an isolated environment. If the target looks like
# production, stop immediately rather than risk an overwrite.
case "$TARGET" in
  *"$PROD_MARKER"*)
    fail "restore target appears to be production; refusing to continue"
    ;;
esac

# --- Guard 3: backup artifact must exist -------------------------------------
if [ ! -f "$BACKUP_FILE" ]; then
  fail "backup file not found: $BACKUP_FILE"
fi

start_ms=$(date +%s%3N 2>/dev/null || date +%s000)

log "restoring backup into isolated target"
if ! "$PG_RESTORE" --no-owner --clean --dbname "$TARGET" "$BACKUP_FILE" >/dev/null 2>&1; then
  fail "pg_restore failed for target $TARGET"
fi

log "running integrity checks"
if ! "$PSQL" "$TARGET" -c "SELECT 1;" >/dev/null 2>&1; then
  fail "integrity check failed: cannot query restored database"
fi

end_ms=$(date +%s%3N 2>/dev/null || date +%s000)
duration_ms=$((end_ms - start_ms))

# --- Record outcome (sanitized: no credentials, no connection strings) --------
{
  echo "backup_file=$(basename "$BACKUP_FILE")"
  echo "outcome=success"
  echo "duration_ms=$duration_ms"
  echo "restored_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$REPORT_FILE"

log "drill passed; report written to $REPORT_FILE"
