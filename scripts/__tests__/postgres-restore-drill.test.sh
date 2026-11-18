#!/usr/bin/env bash

set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${TEST_DIR}/.."
SCRIPT_PATH="$REPO_ROOT/postgres-restore-drill.sh"

# Helper: create a temporary sandbox with a fake pg_restore/psql.
setup_test_env() {
  local tmpdir
  tmpdir=$(mktemp -d)
  trap "rm -rf $tmpdir" EXIT

  # Fake binaries that succeed by default.
  cat > "$tmpdir/pg_restore" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat > "$tmpdir/psql" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "$tmpdir/pg_restore" "$tmpdir/psql"

  echo "ok" > "$tmpdir/backup.dump"
  echo "$tmpdir"
}

# Test 1: refuses to run against a production-looking target.
test_refuses_production_target() {
  local tmpdir
  tmpdir=$(setup_test_env)

  local output
  output=$(XCONFESS_PG_RESTORE="$tmpdir/pg_restore" \
           XCONFESS_PSQL="$tmpdir/psql" \
           XCONFESS_RESTORE_TARGET="postgresql://db.prod.example.com/live" \
           XCONFESS_BACKUP_FILE="$tmpdir/backup.dump" \
           XCONFESS_DRILL_REPORT="$tmpdir/report.log" \
           bash "$SCRIPT_PATH" 2>&1 || true)

  if echo "$output" | grep -q "refusing to continue"; then
    echo "PASS: production target refused"
  else
    echo "FAIL: production target was not refused"
    echo "Output was: $output"
    return 1
  fi
}

# Test 2: fails fast when the restore target is missing.
test_requires_restore_target() {
  local tmpdir
  tmpdir=$(setup_test_env)

  local output
  output=$(XCONFESS_PG_RESTORE="$tmpdir/pg_restore" \
           XCONFESS_PSQL="$tmpdir/psql" \
           XCONFESS_BACKUP_FILE="$tmpdir/backup.dump" \
           XCONFESS_DRILL_REPORT="$tmpdir/report.log" \
           bash "$SCRIPT_PATH" 2>&1 || true)

  if echo "$output" | grep -q "XCONFESS_RESTORE_TARGET is required"; then
    echo "PASS: missing target reported"
  else
    echo "FAIL: missing target not reported"
    echo "Output was: $output"
    return 1
  fi
}

# Test 3: fails when the backup artifact does not exist.
test_requires_backup_file() {
  local tmpdir
  tmpdir=$(setup_test_env)

  local output
  output=$(XCONFESS_PG_RESTORE="$tmpdir/pg_restore" \
           XCONFESS_PSQL="$tmpdir/psql" \
           XCONFESS_RESTORE_TARGET="postgresql://isolated/drill" \
           XCONFESS_BACKUP_FILE="$tmpdir/missing.dump" \
           XCONFESS_DRILL_REPORT="$tmpdir/report.log" \
           bash "$SCRIPT_PATH" 2>&1 || true)

  if echo "$output" | grep -q "backup file not found"; then
    echo "PASS: missing backup reported"
  else
    echo "FAIL: missing backup not reported"
    echo "Output was: $output"
    return 1
  fi
}

# Test 4: records a sanitized success report without credentials.
test_records_sanitized_report() {
  local tmpdir
  tmpdir=$(setup_test_env)

  XCONFESS_PG_RESTORE="$tmpdir/pg_restore" \
    XCONFESS_PSQL="$tmpdir/psql" \
    XCONFESS_RESTORE_TARGET="postgresql://isolated/drill" \
    XCONFESS_BACKUP_FILE="$tmpdir/backup.dump" \
    XCONFESS_DRILL_REPORT="$tmpdir/report.log" \
    bash "$SCRIPT_PATH" >/dev/null 2>&1

  if grep -q "outcome=success" "$tmpdir/report.log"; then
    echo "PASS: success recorded"
  else
    echo "FAIL: success not recorded"
    return 1
  fi

  # The report must not leak the connection string.
  if grep -q "postgresql://" "$tmpdir/report.log"; then
    echo "FAIL: report leaked a connection string"
    return 1
  fi
  echo "PASS: report is sanitized (no connection string)"
}

# Test 5: propagates a restore failure.
test_propagates_restore_failure() {
  local tmpdir
  tmpdir=$(setup_test_env)

  cat > "$tmpdir/pg_restore" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "$tmpdir/pg_restore"

  local output
  output=$(XCONFESS_PG_RESTORE="$tmpdir/pg_restore" \
           XCONFESS_PSQL="$tmpdir/psql" \
           XCONFESS_RESTORE_TARGET="postgresql://isolated/drill" \
           XCONFESS_BACKUP_FILE="$tmpdir/backup.dump" \
           XCONFESS_DRILL_REPORT="$tmpdir/report.log" \
           bash "$SCRIPT_PATH" 2>&1 || true)

  if echo "$output" | grep -q "pg_restore failed"; then
    echo "PASS: restore failure propagated"
  else
    echo "FAIL: restore failure not propagated"
    echo "Output was: $output"
    return 1
  fi
}

echo "Running postgres restore drill validation tests..."
test_refuses_production_target
test_requires_restore_target
test_requires_backup_file
test_records_sanitized_report
test_propagates_restore_failure
echo "All tests passed"
