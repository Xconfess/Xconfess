# Notification Jobs API Specification

## Overview
This document specifies the API endpoints required for the Failed Notification Jobs Dashboard frontend implementation.

## Base URL
```
/admin/notifications
```

## Authentication
All endpoints require:
- JWT authentication via `Authorization: Bearer <token>` header
- Admin role verification

## Endpoints

### 1. List Failed Notification Jobs

**Endpoint**: `GET /admin/notifications/dlq`

**Description**: Retrieves a paginated list of failed notification jobs from the dead letter queue.

**Query Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| page | number | No | 1 | Page number (1-indexed) |
| limit | number | No | 20 | Items per page (max: 100) |
| failedAfter | ISO 8601 string | No | - | Filter jobs failed after this timestamp |
| failedBefore | ISO 8601 string | No | - | Filter jobs failed before this timestamp |
| search | string | No | - | Search in job data (optional) |

**Request Example**:
```http
GET /admin/notifications/dlq?page=1&limit=20&failedAfter=2024-02-01T00:00:00Z
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response**: `200 OK`
```json
{
  "jobs": [
    {
      "id": "job-123456789012345",
      "name": "comment-notification",
      "attemptsMade": 3,
      "maxAttempts": 3,
      "failedReason": "SMTP connection timeout after 30 seconds",
      "failedAt": "2024-02-20T10:30:00.000Z",
      "createdAt": "2024-02-20T09:00:00.000Z",
      "channel": "email",
      "recipientEmail": "user@example.com"
    },
    {
      "id": "job-987654321098765",
      "name": "comment-notification",
      "attemptsMade": 2,
      "maxAttempts": 3,
      "failedReason": "Invalid email address format",
      "failedAt": "2024-02-20T11:00:00.000Z",
      "createdAt": "2024-02-20T10:30:00.000Z",
      "channel": "email",
      "recipientEmail": "invalid@test"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20
}
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| jobs | array | Array of failed job objects |
| jobs[].id | string | Unique job identifier |
| jobs[].name | string | Job type/name |
| jobs[].attemptsMade | number | Number of retry attempts made |
| jobs[].maxAttempts | number | Maximum retry attempts allowed |
| jobs[].failedReason | string\|null | Reason for failure |
| jobs[].failedAt | string\|null | ISO 8601 timestamp of last failure |
| jobs[].createdAt | string\|null | ISO 8601 timestamp of job creation |
| jobs[].channel | string | Notification channel (e.g., "email") |
| jobs[].recipientEmail | string | Recipient email address (optional) |
| total | number | Total number of failed jobs matching filters |
| page | number | Current page number |
| limit | number | Items per page |

**Error Responses**:

`401 Unauthorized`:
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

`403 Forbidden`:
```json
{
  "statusCode": 403,
  "message": "Admin access required",
  "error": "Forbidden"
}
```

`500 Internal Server Error`:
```json
{
  "statusCode": 500,
  "message": "Failed to retrieve failed jobs",
  "error": "Internal Server Error"
}
```

---

### 2. Replay Failed Notification Job

**Endpoint**: `POST /admin/notifications/dlq/:jobId/replay`

**Description**: Attempts to replay a failed notification job by moving it back to the main queue.

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| jobId | string | Yes | Unique identifier of the job to replay |

**Request Body**:
```json
{
  "reason": "Manual retry after fixing SMTP configuration"
}
```

**Body Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| reason | string | No | Optional reason for replaying the job (for audit logs) |

**Request Example**:
```http
POST /admin/notifications/dlq/job-123456789012345/replay
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "reason": "Manual retry after fixing SMTP configuration"
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Job replayed successfully",
  "jobId": "job-123456789012345"
}
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether the replay was successful |
| message | string | Human-readable success message |
| jobId | string | ID of the replayed job |

**Error Responses**:

`400 Bad Request`:
```json
{
  "statusCode": 400,
  "message": "Invalid job ID format",
  "error": "Bad Request"
}
```

`404 Not Found`:
```json
{
  "statusCode": 404,
  "message": "Job not found in dead letter queue",
  "error": "Not Found"
}
```

`409 Conflict`:
```json
{
  "statusCode": 409,
  "message": "Job is already being replayed",
  "error": "Conflict"
}
```

`500 Internal Server Error`:
```json
{
  "statusCode": 500,
  "message": "Failed to replay job",
  "error": "Internal Server Error"
}
```

---

## Implementation Notes

### Backend Implementation (NestJS)

The backend already has the controller implemented in:
- `xconfess-backend/src/notification/notification.admin.controller.ts`

The controller uses:
- `NotificationQueue.listDlqJobs()` for listing failed jobs
- `NotificationQueue.replayDlqJob()` for replaying jobs

### BullMQ Integration

The implementation uses BullMQ's built-in dead letter queue functionality:

```typescript
// List failed jobs
async listDlqJobs(page = 1, limit = 20, filter?: DlqJobFilter) {
  const dlqJobs = await this.queue.getFailed(0, -1);
  
  // Filter by date range
  let filtered = dlqJobs;
  if (filter?.failedAfter) {
    filtered = filtered.filter(j => 
      j.finishedOn && j.finishedOn >= new Date(filter.failedAfter).getTime()
    );
  }
  if (filter?.failedBefore) {
    filtered = filtered.filter(j => 
      j.finishedOn && j.finishedOn <= new Date(filter.failedBefore).getTime()
    );
  }
  
  // Paginate
  const start = (page - 1) * limit;
  const end = start + limit;
  const paginated = filtered.slice(start, end);
  
  // Transform to response format
  const jobs = paginated.map(job => ({
    id: job.id,
    name: job.name,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts,
    failedReason: job.failedReason,
    failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    channel: job.data.channel || 'email',
    recipientEmail: job.data.recipientEmail,
  }));
  
  return {
    jobs,
    total: filtered.length,
    page,
    limit,
  };
}

// Replay failed job
async replayDlqJob(jobId: string, actorId: string, reason?: string) {
  const job = await this.queue.getJob(jobId);
  
  if (!job) {
    throw new NotFoundException('Job not found in dead letter queue');
  }
  
  // Check if job is actually failed
  const state = await job.getState();
  if (state !== 'failed') {
    throw new ConflictException('Job is not in failed state');
  }
  
  // Log audit event
  await this.auditLogService.log({
    adminId: actorId,
    action: 'replay-notification-job',
    entityType: 'notification-job',
    entityId: jobId,
    notes: reason,
  });
  
  // Retry the job
  await job.retry();
  
  return {
    success: true,
    message: 'Job replayed successfully',
    jobId,
  };
}
```

### Security Considerations

1. **Authentication**: Verify JWT token on every request
2. **Authorization**: Ensure user has admin role
3. **Rate Limiting**: Implement rate limiting on replay endpoint to prevent abuse
4. **Audit Logging**: Log all replay actions with admin ID and reason
5. **Input Validation**: Validate job ID format and reason length
6. **Email Privacy**: Consider masking emails in logs

### Performance Considerations

1. **Pagination**: Always paginate results to avoid loading too many jobs
2. **Indexing**: Index `finishedOn` field for efficient date range queries
3. **Caching**: Consider caching job counts for dashboard metrics
4. **Async Processing**: Replay operation should be async to avoid blocking

### Testing

#### Unit Tests
```typescript
describe('NotificationAdminController', () => {
  it('should list failed jobs with pagination', async () => {
    const result = await controller.listDlqJobs(1, 20);
    expect(result.jobs).toBeDefined();
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
  
  it('should replay a failed job', async () => {
    const result = await controller.replayDlqJob('job-123', 'Test reason', mockRequest);
    expect(result.success).toBe(true);
    expect(result.jobId).toBe('job-123');
  });
  
  it('should throw 404 for non-existent job', async () => {
    await expect(
      controller.replayDlqJob('invalid-job', 'Test', mockRequest)
    ).rejects.toThrow(NotFoundException);
  });
});
```

#### Integration Tests
```typescript
describe('Notification Jobs API (e2e)', () => {
  it('GET /admin/notifications/dlq', () => {
    return request(app.getHttpServer())
      .get('/admin/notifications/dlq?page=1&limit=20')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.jobs).toBeDefined();
        expect(res.body.total).toBeGreaterThanOrEqual(0);
      });
  });
  
  it('POST /admin/notifications/dlq/:jobId/replay', () => {
    return request(app.getHttpServer())
      .post('/admin/notifications/dlq/job-123/replay')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Test replay' })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
      });
  });
});
```

## Migration Checklist

### Backend Tasks
- [x] Controller implemented (`notification.admin.controller.ts`)
- [x] Queue service methods implemented (`notification.queue.ts`)
- [ ] Add rate limiting to replay endpoint
- [ ] Add comprehensive error handling
- [ ] Add audit logging for replay actions
- [ ] Add unit tests for controller
- [ ] Add integration tests for endpoints
- [ ] Update API documentation
- [ ] Deploy to staging environment
- [ ] Verify with frontend team

### Frontend Tasks
- [x] Type definitions created
- [x] API client methods implemented
- [x] Page component implemented
- [x] Tests written and passing
- [x] Documentation completed
- [ ] Integration testing with backend
- [ ] User acceptance testing
- [ ] Deploy to production

## API Versioning

Current version: `v1`

Future versions should maintain backward compatibility or use versioned endpoints:
- `/v1/admin/notifications/dlq`
- `/v2/admin/notifications/dlq`

## Monitoring & Metrics

Recommended metrics to track:
- Number of failed jobs per hour/day
- Replay success rate
- Average time to replay
- Most common failure reasons
- Jobs by channel (email, SMS, push)

## Support

For questions or issues:
- Backend: Check `notification.queue.ts` implementation
- Frontend: Check `NOTIFICATIONS_DASHBOARD_IMPLEMENTATION.md`
- API: This document

## Changelog

### 2024-02-24
- Initial API specification
- Documented existing endpoints
- Added implementation notes
- Added testing guidelines
