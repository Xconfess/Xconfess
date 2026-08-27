# Incident Runbook: Emergency Pause, DLQ, Export, and Auth Failures

## 1. Overview

This runbook provides step-by-step incident response procedures for four critical failure categories in xConfess:

- **Emergency Pause** — Halt all write operations platform-wide
- **Notification DLQ Failures** — Dead letter queue buildup in notification pipeline
- **Data Export Failures** — Export jobs failing or producing incomplete data
- **Auth Incidents** — Session/auth service degradation or compromise

Each section defines symptoms, immediate actions, verification steps, and rollback procedures.

**Key Principle:** Sensitive operations (emergency pause, auth key rotation) require explicit maintainer approval before execution.

---

## 2. Emergency Pause

### 2.1 When to Trigger

- Active data breach or unauthorized access detected
- Smart contract vulnerability exploited
- Database corruption or integrity compromise
- Regulatory/legal requirement to halt operations

### 2.2 Symptoms

- Unusual write patterns in audit logs
- Reports of unauthorized confessions or content
- Smart contract anomalies (unexpected state changes)
- Security scanner alerts

### 2.3 Immediate Actions

**Requires maintainer approval.** Do NOT execute without explicit authorization.

```bash
# Step 1: Set the platform to read-only mode
# This env var disables all write endpoints
export XCONFESS_PAUSE_WRITES=true

# Step 2: Restart backend with pause flag
cd xconfess-backend
npm run build
XCONFESS_PAUSE_WRITES=true node dist/main.js

# Step 3: Verify pause is active
curl -s http://localhost:5000/api/health/ready | jq '.checks'
# All write-dependent checks should show "paused" status
```

### 2.4 Verification

```bash
# Confirm writes are rejected
curl -X POST http://localhost:5000/api/confessions \
  -H "Content-Type: application/json" \
  -d '{"text": "test"}' \
  -w "\n%{http_code}"
# Expected: 503 Service Unavailable with "Platform paused" message

# Confirm reads still work
curl -s http://localhost:5000/api/confessions | jq 'length'
# Expected: Returns existing confessions normally
```

### 2.5 Rollback

```bash
# Remove pause flag and restart
unset XCONFESS_PAUSE_WRITES
npm run build
node dist/main.js

# Verify writes resume
curl -X POST http://localhost:5000/api/health/ready -w "\n%{http_code}"
# Expected: 200 OK
```

---

## 3. Notification DLQ Failures

### 3.1 When to Investigate

- Users report missing notifications
- BullMQ dashboard shows growing DLQ count
- `/api/health/ready` shows queue check failing

### 3.2 Symptoms

- `notifications:dlq` Redis list growing unbounded
- Health endpoint returns degraded queue status
- Users report missing email/push/WebSocket notifications
- Backend logs show repeated job failures

### 3.3 Diagnosis

```bash
# Check DLQ size
redis-cli LLEN notifications:dlq

# Inspect recent DLQ entries
redis-cli LRANGE notifications:dlq 0 9

# Check BullMQ dashboard (if available)
curl -s http://localhost:5000/api/admin/queues | jq '.[] | select(.name == "notifications")'

# Check worker logs for failure patterns
docker logs xconfess-backend --tail 100 2>&1 | grep -i "dlq\|failed\|error"
```

### 3.4 Immediate Actions

```bash
# Step 1: Identify failure pattern
# Common causes:
# - External service down (email provider, push service)
# - Rate limiting from notification providers
# - Malformed notification payload
# - Redis memory exhaustion

# Step 2: Check Redis memory
redis-cli INFO memory | grep used_memory_human

# Step 3: If Redis is full, increase maxmemory
redis-cli CONFIG SET maxmemory 512mb

# Step 4: Retry failed jobs (if external service recovered)
# Access BullMQ dashboard at /admin/queues
# Select "notifications" queue → "Retry All Failed" button
```

### 3.5 Verification

```bash
# DLQ should be draining
watch -n 5 'redis-cli LLEN notifications:dlq'

# Health check should show queue healthy
curl -s http://localhost:5000/api/health/ready | jq '.checks.queue'

# Users should receive pending notifications within 5 minutes
```

### 3.6 Rollback

If DLQ is corrupted or unrecoverable:

```bash
# Archive DLQ entries before clearing
redis-cli LRANGE notifications:dlq 0 -1 > dlq-backup-$(date +%s).json

# Clear DLQ
redis-cli DEL notifications:dlq

# Restart workers to pick up new jobs
docker restart xconfess-backend
```

---

## 4. Data Export Failures

### 4.1 When to Investigate

- Users report incomplete or missing export files
- Export jobs stuck in "processing" state
- `/api/health/ready` shows storage check failing

### 4.2 Symptoms

- Export jobs in database with `status: 'failed'` or `status: 'processing'` for > 30 minutes
- S3/storage bucket shows 0-byte or missing export files
- Users receive empty or truncated ZIP archives
- Backend logs show storage permission errors

### 4.3 Diagnosis

```bash
# Check export job status
psql -h localhost -p 55432 -U postgres -d xconfess \
  -c "SELECT id, user_id, status, created_at, completed_at FROM export_jobs ORDER BY created_at DESC LIMIT 10;"

# Check storage connectivity
curl -s http://localhost:5000/api/health/ready | jq '.checks.storage'

# Check backend logs for export errors
docker logs xconfess-backend --tail 200 2>&1 | grep -i "export\|s3\|storage\|zip"
```

### 4.4 Immediate Actions

```bash
# Step 1: If storage is down, check S3/MinIO status
docker ps | grep -i "minio\|s3"

# Step 2: If storage is up but exports fail, check permissions
aws s3 ls s3://xconfess-exports/ --profile xconfess 2>&1 || \
  mc ls local/xconfess-exports 2>&1

# Step 3: Retry failed export jobs
psql -h localhost -p 55432 -U postgres -d xconfess \
  -c "UPDATE export_jobs SET status = 'pending', error = NULL WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours';"

# Step 4: Restart export worker
docker restart xconfess-backend
```

### 4.5 Verification

```bash
# Check that pending jobs are being processed
watch -n 10 "psql -h localhost -p 55432 -U postgres -d xconfess -c \"SELECT status, count(*) FROM export_jobs GROUP BY status;\""

# Verify a test export completes
curl -X POST http://localhost:5000/api/export/request \
  -H "Cookie: session=<valid-session>" \
  -w "\n%{http_code}"
# Expected: 202 Accepted, then check job completes within 5 minutes
```

### 4.6 Rollback

If export system is completely broken:

```bash
# Disable export endpoint temporarily
# Add to backend .env:
echo "XCONFESS_DISABLE_EXPORTS=true" >> xconfess-backend/.env

# Restart backend
docker restart xconfess-backend

# Notify users that exports are temporarily unavailable
```

---

## 5. Auth Incidents

### 5.1 When to Trigger

- Surge in 401/403 errors
- Reports of account takeover or unauthorized access
- Session token compromise suspected
- Auth service unresponsive

### 5.2 Symptoms

- Health endpoint shows auth check failing
- Users report being logged out unexpectedly
- Admin dashboard shows unusual login patterns
- Backend logs show `AUTH_TOKEN_INVALID` or `SESSION_EXPIRED` spikes

### 5.3 Diagnosis

```bash
# Check auth health
curl -s http://localhost:5000/api/health/ready | jq '.checks.auth'

# Check recent auth errors
docker logs xconfess-backend --tail 500 2>&1 | grep -i "auth\|session\|token\|401\|403" | tail -20

# Check Redis session store
redis-cli DBSIZE
redis-cli SCAN 0 MATCH "sess:*" COUNT 10

# Check for brute force patterns
docker logs xconfess-backend --tail 1000 2>&1 | grep "LOGIN_FAILED" | \
  awk '{print $1}' | sort | uniq -c | sort -rn | head -10
```

### 5.4 Immediate Actions

```bash
# Step 1: If token compromise suspected, rotate signing keys
# Requires maintainer approval
export XCONFESS_SESSION_SECRET=$(openssl rand -hex 32)

# Step 2: Invalidate all existing sessions
redis-cli FLUSHDB  # WARNING: This logs out ALL users

# Step 3: Restart with new secret
cd xconfess-backend
XCONFESS_SESSION_SECRET=$XCONFESS_SESSION_SECRET npm run start:prod

# Step 4: If brute force detected, enable rate limiting
# Check if rate limiting is already active
curl -s http://localhost:5000/api/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}' \
  -w "\n%{http_code}" -o /dev/null
# Repeat 10 times rapidly — should get 429 Too Many Requests
```

### 5.5 Verification

```bash
# Confirm new sessions work
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}' \
  -w "\n%{http_code}"
# Expected: 200 OK with new session cookie

# Confirm old sessions are invalidated
curl -s http://localhost:5000/api/auth/me \
  -H "Cookie: session=<old-session>" \
  -w "\n%{http_code}"
# Expected: 401 Unauthorized
```

### 5.6 Rollback

If new session secret causes issues:

```bash
# Restore previous session secret
export XCONFESS_SESSION_SECRET=<previous-secret>

# Restart backend
cd xconfess-backend
npm run start:prod

# Note: Users logged out during rotation will need to re-login
```

---

## 6. Escalation Matrix

| Severity | Condition | Response Time | Who to Notify |
|----------|-----------|---------------|---------------|
| **P0 — Critical** | Emergency pause triggered, data breach | Immediate | All maintainers, security team |
| **P1 — High** | Auth down, DLQ > 1000 entries, exports completely failing | 15 minutes | On-call maintainer |
| **P2 — Medium** | DLQ growing but draining, intermittent export failures | 1 hour | Backend team |
| **P3 — Low** | Minor notification delays, cosmetic export issues | 4 hours | Normal sprint workflow |

---

## 7. Post-Incident Checklist

After resolving any incident:

- [ ] Document timeline in incident channel
- [ ] Update this runbook with new findings
- [ ] Schedule post-mortem if P0/P1
- [ ] Verify all monitoring/alerting is restored
- [ ] Confirm no data loss occurred
- [ ] Notify affected users if required (privacy incidents)

---

## 8. Related Documentation

- [Health Endpoint Quick Reference](./HEALTH_ENDPOINT_QUICK_REFERENCE.md)
- [Realtime Incident Playbook](./realtime-incident-playbook.md)
- [Data Export Privacy Runbook](./data-export-privacy-runbook.md)
- [Contract Signer Rotation Runbook](./contract-signer-rotation-runbook.md)
- [Release Readiness Checklist](./release-readiness-checklist.md)
