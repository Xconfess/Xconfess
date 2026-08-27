# Failed Notification Jobs Dashboard - Implementation Summary

## Overview
This dashboard adds an admin surface for monitoring and replaying failed notification delivery jobs with responsive UI, typed API access, confirmation flows, and test coverage.

## What Was Implemented

### Core Page
- `app/(dashboard)/admin/notifications/page.tsx`
- Responsive table layout with pagination, filters, loading states, empty states, and replay actions

### Types
- `app/lib/types/notification-jobs.ts`
- Shared types for failed jobs, filters, and replay responses

### Runtime API Client
- `app/lib/api/admin.ts`
- Added:
  - `getFailedNotificationJobs(filter?)`
  - `replayFailedNotificationJob(jobId, reason?)`
- Runtime now uses the shared admin API client only
- Local browser mock toggles were removed from the runtime path

### Shared Confirmation UI
- `app/components/admin/ConfirmDialog.tsx`
- Reusable confirmation dialog for replay and other admin actions

### Supporting Hooks
- `app/lib/hooks/useDebounce.ts`
- Debounced filters to reduce request churn

### Tests
- `app/(dashboard)/admin/notifications/__tests__/page.test.tsx`
- `app/lib/api/__tests__/admin-notifications.test.ts`
- `app/lib/hooks/__tests__/useDebounce.test.ts`

## API Contract

### GET `/admin/notifications/dlq`
Query parameters:
- `page`
- `limit`
- `failedAfter`
- `failedBefore`

Response:
```json
{
  "jobs": [],
  "total": 0,
  "page": 1,
  "limit": 20
}
```

### POST `/admin/notifications/dlq/:jobId/replay`
Request body:
```json
{
  "reason": "Optional reason for replay"
}
```

Response:
```json
{
  "success": true,
  "message": "Job replayed successfully",
  "jobId": "job-123"
}
```

## Testing Notes
- Frontend tests should mock `apiClient` directly.
- The runtime client no longer supports legacy browser mock toggles.
- The runtime client no longer supports legacy mock-admin fallbacks.

## Development Notes
- Start the frontend with `npm run dev`.
- Point the app at a live backend for end-to-end testing.
- For isolated frontend tests, mock network calls at the client layer.

## Troubleshooting
- If the page cannot load jobs, verify the backend endpoint is running.
- If replay fails, inspect the network response and backend logs.
- If frontend-only tests fail, check the mocked `apiClient` expectations first.
