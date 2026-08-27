# Export Queue Failure Recovery Runbook

## Overview

The export queue (`export-queue`) processes user data export requests. Unlike the
notification queue, it has **no dead-letter queue (DLQ)**. Failed jobs transition
the export record to `FAILED` status with `retryCount` and `lastFailureReason`
persisted for operator investigation.

## Queue Configuration

| Setting | Value |
|---|---|
| Queue name | `export-queue` |
| DLQ | None (no automatic retry at BullMQ level) |
| Job name | `process-export` |
| Failure handling | Inline `markExportFailed()` with retryCount increment |

## Lifecycle States

```
PENDING → PROCESSING → READY
                     → FAILED (with retryCount, lastFailureReason)
                     → EXPIRED (after 24h retention window)
```

## Common Failure Scenarios

### 1. Database Connection Lost
- **Symptom**: `markExportProcessing` or `compileUserData` throws connection error
- **LastFailureReason**: `DB connection lost` or similar
- **Recovery**: User can retry via the UI (creates a new export request after 7-day cooldown elapses)

### 2. Data Compilation Timeout
- **Symptom**: `compileUserData` exceeds timeout for large datasets
- **LastFailureReason**: `timeout`
- **Recovery**: Check user data size; consider increasing timeout or chunking strategy

### 3. ZIP Generation Memory Error
- **Symptom**: `archiver` throws out-of-memory during chunked ZIP creation
- **LastFailureReason**: `out of memory` or similar
- **Recovery**: Monitor memory usage; may need to reduce CHUNK_SIZE_LIMIT

## Investigating Failed Exports

```sql
-- Find all failed exports with their failure reasons
SELECT id, userId, "retryCount", "lastFailureReason", "failedAt"
FROM export_requests
WHERE status = 'FAILED'
ORDER BY "failedAt" DESC;

-- Find exports stuck in PROCESSING (possible zombie jobs)
SELECT id, userId, "processingAt"
FROM export_requests
WHERE status = 'PROCESSING'
AND "processingAt" < NOW() - INTERVAL '30 minutes';
```

## Manual Retry

There is no automatic retry mechanism. To retry a failed export:

1. The user creates a new export request (subject to 7-day cooldown)
2. Operators can manually reset a FAILED record to PENDING and re-enqueue:
   ```sql
   UPDATE export_requests
   SET status = 'PENDING', "failedAt" = NULL, "retryCount" = 0
   WHERE id = '<request-id>';
   ```
3. Then enqueue the job via the application or BullMQ dashboard

## Monitoring

- **retryCount**: Incremented on each failure; persists across attempts
- **lastFailureReason**: Human-readable error message from the processor
- **failedAt**: Timestamp of the most recent failure
- Use `GET /data-export/:id/status` to check the full lifecycle timeline
