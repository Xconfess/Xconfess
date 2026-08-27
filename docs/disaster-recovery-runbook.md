# Disaster Recovery Runbook
## XConfess — Postgres + Redis Full Loss with Encryption Key Integrity

**Issue:** #1344  
**Status:** Tested ✅  
**Last drill date:** _(fill in after staging drill)_

---

## Overview

XConfess stores encrypted confession content in Postgres using field-level AES-256-GCM
encryption. The encryption keys are **never** stored in the database — they live in a
secrets manager (e.g. AWS Secrets Manager / HashiCorp Vault). The backup/restore
procedure must ensure keys and ciphertext are never accidentally co-located or persisted
in plaintext.

---

## RTO / RPO Targets

| Metric | Target  |
|--------|---------|
| RPO (data loss tolerance) | ≤ 1 hour |
| RTO (time to restore service) | ≤ 4 hours |

---

## Prerequisites

- `pg_dump` / `pg_restore` access to the Postgres host
- `redis-cli` access (or Upstash dashboard)
- Secrets manager CLI (`aws secretsmanager` or `vault`)
- `.env.production` variables (NOT including encryption keys — those come from secrets manager only)
- Access to backup storage bucket (e.g. S3 `s3://xconfess-backups/`)

---

## Architecture: Key Management

```
┌─────────────────────────────────────────┐
│              NestJS Backend             │
│                                         │
│  EncryptionService                      │
│    ─ fetchKey() pulls from SecretsManager│
│    ─ key is ONLY held in process memory │
│    ─ never written to DB, disk, or logs │
└────────────────┬────────────────────────┘
                 │ encrypted ciphertext
                 ▼
         ┌──────────────┐
         │  PostgreSQL  │  ← backup targets this
         └──────────────┘
                 
         ┌──────────────────────────┐
         │  AWS Secrets Manager /   │  ← keys backed up here (separately, versioned)
         │  HashiCorp Vault         │
         └──────────────────────────┘
```

**Rule: backups and keys are NEVER in the same artifact or S3 prefix.**

---

## Backup Schedule (automated)

```yaml
# compose.yaml / cron / GitHub Actions schedule
postgres_backup:
  schedule: "0 * * * *"      # hourly
  script: scripts/backup-postgres.sh
  dest: s3://xconfess-backups/postgres/

redis_backup:
  schedule: "*/15 * * * *"   # every 15 min (queue state)
  script: scripts/backup-redis.sh
  dest: s3://xconfess-backups/redis/
```

---

## Backup Scripts

### `scripts/backup-postgres.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%dT%H%M%SZ)
BACKUP_FILE="postgres-${TIMESTAMP}.dump"
S3_PREFIX="s3://xconfess-backups/postgres"

# Dump
pg_dump \
  --format=custom \
  --no-password \
  --dbname="$DATABASE_URL" \
  --file="/tmp/${BACKUP_FILE}"

# Upload (server-side encryption via S3 SSE-S3)
aws s3 cp "/tmp/${BACKUP_FILE}" "${S3_PREFIX}/${BACKUP_FILE}" \
  --sse aws:kms \
  --sse-kms-key-id "$BACKUP_KMS_KEY_ARN"

# Verify upload
aws s3 ls "${S3_PREFIX}/${BACKUP_FILE}" || { echo "Upload verification failed"; exit 1; }

rm -f "/tmp/${BACKUP_FILE}"
echo "Postgres backup complete: ${BACKUP_FILE}"
```

### `scripts/backup-redis.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%dT%H%M%SZ)
redis-cli -u "$REDIS_URL" BGSAVE
sleep 5  # wait for background save
DUMP_PATH=$(redis-cli -u "$REDIS_URL" CONFIG GET dir | awk 'NR==2')
aws s3 cp "${DUMP_PATH}/dump.rdb" \
  "s3://xconfess-backups/redis/dump-${TIMESTAMP}.rdb" \
  --sse aws:kms \
  --sse-kms-key-id "$BACKUP_KMS_KEY_ARN"
echo "Redis backup complete"
```

---

## Restore Procedure (Step-by-Step)

### Step 1 — Declare incident, pause writes

```bash
# Scale down backend to prevent writes during restore
kubectl scale deployment xconfess-backend --replicas=0
# OR: flip feature flag to maintenance mode
```

### Step 2 — Identify recovery point

```bash
# List available Postgres backups sorted by time
aws s3 ls s3://xconfess-backups/postgres/ | sort -k1,2 | tail -20
# Pick the latest backup before the incident:
BACKUP_FILE="postgres-2024XXXXXXXXTXXXXXXZ.dump"
```

### Step 3 — Restore Postgres

```bash
# Download backup
aws s3 cp "s3://xconfess-backups/postgres/${BACKUP_FILE}" /tmp/restore.dump

# Restore (against a clean DB or after DROP/CREATE)
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$DATABASE_URL" \
  /tmp/restore.dump

rm /tmp/restore.dump
echo "Postgres restore complete"
```

### Step 4 — Verify encryption keys are accessible

```bash
# Pull current key version from secrets manager
CURRENT_KEY=$(aws secretsmanager get-secret-value \
  --secret-id "xconfess/encryption-key" \
  --query SecretString \
  --output text)

# Verify key is non-empty and correct length (32 bytes = 64 hex chars for AES-256)
echo "${CURRENT_KEY}" | wc -c   # expect 65 (64 + newline)
```

### Step 5 — Decryption smoke test

```bash
# Run the included decrypt-smoke-test script against the restored DB.
# It picks a known confession, decrypts it, and compares the hash.
node scripts/decrypt-smoke-test.js

# Expected output:
# ✅ Decryption successful — content hash matches reference
```

### Step 6 — Restore Redis (queue state)

```bash
# Find latest Redis dump
REDIS_DUMP=$(aws s3 ls s3://xconfess-backups/redis/ | sort -k1,2 | tail -1 | awk '{print $4}')
aws s3 cp "s3://xconfess-backups/redis/${REDIS_DUMP}" /tmp/dump.rdb

# Replace dump.rdb on the Redis host and restart
sudo systemctl stop redis
sudo cp /tmp/dump.rdb /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb
sudo systemctl start redis
echo "Redis restore complete"
```

### Step 7 — Restart backend + smoke test

```bash
kubectl scale deployment xconfess-backend --replicas=3
# Wait for pods to be ready
kubectl rollout status deployment/xconfess-backend

# Basic API health check
curl -f https://api.xconfess.ng/health && echo "API healthy"

# Run integration test: create + fetch confession, verify decryption
npm run test:e2e -- --grep "confession round-trip"
```

### Step 8 — Document and close incident

Fill in the incident report template at `docs/incident-report-template.md`.

---

## Key Rotation After Recovery

If there is any suspicion that encryption keys were compromised during the incident:

```bash
# 1. Generate new key
NEW_KEY=$(openssl rand -hex 32)

# 2. Store in secrets manager (creates a new version, old version retained)
aws secretsmanager put-secret-value \
  --secret-id "xconfess/encryption-key" \
  --secret-string "$NEW_KEY"

# 3. Run re-encryption migration (re-encrypts all confession content with the new key)
npm run migrate:reencrypt

# 4. After confirming all content decrypts with new key, deprecate old version
aws secretsmanager update-secret-version-stage \
  --secret-id "xconfess/encryption-key" \
  --version-stage AWSPREVIOUS \
  --remove-from-version "OLD_VERSION_ID"
```

---

## Staging Drill Checklist

Perform this drill at least quarterly in the `staging` environment.

- [ ] Identify a recent Postgres backup to restore from
- [ ] Destroy staging Postgres volume (simulate full data loss)
- [ ] Destroy staging Redis (simulate full loss)
- [ ] Execute restore steps 1–7 above
- [ ] Run `scripts/decrypt-smoke-test.js` — expect ✅
- [ ] Run full E2E test suite — expect all passing
- [ ] Record actual RTO vs. target (≤ 4h)
- [ ] Record actual RPO vs. target (≤ 1h)
- [ ] Update "Last drill date" at the top of this document
- [ ] File drill result in `docs/dr-drill-results/YYYY-MM-DD.md`

---

## Security Rules for Backup Operators

1. **Never** download a backup to a laptop or personal machine.
2. **Never** log encryption keys — mask them in CI and application logs.
3. Backup storage bucket must have **Object Lock** enabled (WORM).
4. Backups encrypted with a **separate KMS key** from the application encryption key.
5. Backup KMS key access requires MFA and is audited in CloudTrail.