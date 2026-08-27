# Admin API Documentation

## Overview
The Admin API provides endpoints for moderators to manage reports, confessions, users, and view platform analytics. All endpoints require admin authentication.

## Authentication
All admin endpoints require:
- Valid JWT token in `Authorization: Bearer <token>` header
- User must have `isAdmin: true` in their user record

## Endpoints

### Reports

#### GET /api/admin/reports
List all reports with filtering options.

**Query Parameters:**
- `status` (optional): Filter by status (`pending`, `reviewing`, `resolved`, `dismissed`)
- `type` (optional): Filter by type (`spam`, `harassment`, `hate_speech`, `inappropriate_content`, `copyright`, `other`)
- `startDate` (optional): Filter reports created after this date (ISO string)
- `endDate` (optional): Filter reports created before this date (ISO string)
- `limit` (optional, default: 50): Number of results per page
- `offset` (optional, default: 0): Pagination offset

**Response:**
```json
{
  "reports": [...],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

#### GET /api/admin/reports/:id
Get a specific report by ID.

**Response:**
```json
{
  "id": "uuid",
  "confessionId": "uuid",
  "type": "spam",
  "status": "pending",
  "reason": "...",
  "createdAt": "2024-01-01T00:00:00Z",
  ...
}
```

#### PATCH /api/admin/reports/:id/resolve
Resolve a report.

**Body:**
```json
{
  "resolutionNotes": "Optional notes about the resolution"
}
```

#### PATCH /api/admin/reports/:id/dismiss
Dismiss a report.

**Body:**
```json
{
  "resolutionNotes": "Optional notes about why it was dismissed"
}
```

#### PATCH /api/admin/reports/bulk-resolve
Resolve multiple reports at once.

**Body:**
```json
{
  "reportIds": ["uuid1", "uuid2", ...],
  "notes": "Optional notes"
}
```

### Confessions

#### DELETE /api/admin/confessions/:id
Delete a confession (soft delete).

**Body:**
```json
{
  "reason": "Optional reason for deletion"
}
```

#### PATCH /api/admin/confessions/:id/hide
Hide a confession from public view.

**Body:**
```json
{
  "reason": "Optional reason for hiding"
}
```

#### PATCH /api/admin/confessions/:id/unhide
Unhide a previously hidden confession.

### Users

#### GET /api/admin/users/search
Search for users by username.

**Query Parameters:**
- `q` (required): Search query
- `limit` (optional, default: 50): Number of results
- `offset` (optional, default: 0): Pagination offset

#### GET /api/admin/users/:id/history
Get user history including reports and confessions.

#### PATCH /api/admin/users/:id/ban
Ban a user.

**Body:**
```json
{
  "reason": "Optional reason for ban"
}
```

#### PATCH /api/admin/users/:id/unban
Unban a user.

### Analytics

#### GET /api/admin/analytics
Get platform analytics and statistics.

**Query Parameters:**
- `startDate` (optional): Start date for analytics period (ISO string)
- `endDate` (optional): End date for analytics period (ISO string)

**Response:**
```json
{
  "overview": {
    "totalUsers": 1000,
    "activeUsers": 500,
    "totalConfessions": 5000,
    "totalReports": 100,
    "bannedUsers": 10,
    "hiddenConfessions": 50,
    "deletedConfessions": 20
  },
  "reports": {
    "byStatus": [...],
    "byType": [...]
  },
  "trends": {
    "confessionsOverTime": [...]
  }
}
```

### Audit Logs

#### GET /api/admin/audit-logs
Get audit logs of all moderation actions.

**Query Parameters:**
- `adminId` (optional): Filter by admin user ID
- `action` (optional): Filter by action type
- `entityType` (optional): Filter by entity type (`report`, `confession`, `user`)
- `entityId` (optional): Filter by specific entity ID
- `limit` (optional, default: 100): Number of results
- `offset` (optional, default: 0): Pagination offset

## Error Responses

All endpoints may return:
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User is not an admin
- `404 Not Found`: Resource not found
- `400 Bad Request`: Invalid request parameters

## Rate Limiting
Admin endpoints are subject to the same rate limiting as other endpoints (configured via ThrottlerModule).
