# Failed Notification Jobs Dashboard

A mobile-responsive admin dashboard page for monitoring and replaying failed notification delivery attempts.

## Features

### Core Functionality
- **Real-time Job Monitoring**: Displays failed notification jobs with comprehensive details
- **Server-side Pagination**: Efficient handling of large datasets with configurable page size
- **Advanced Filtering**: Filter by status, date range, and retry count
- **Replay Action**: Manually retry failed notification jobs with confirmation
- **Optimistic Updates**: Immediate UI feedback with automatic rollback on errors

### UI/UX
- **Mobile Responsive**: Fully responsive design that works on all screen sizes
- **Loading States**: Skeleton loaders during data fetching
- **Empty States**: Clear messaging when no jobs are found
- **Error States**: Graceful error handling with retry options
- **Data Sanitization**: Email masking and text truncation for privacy and readability

### Performance
- **Debounced Filters**: 500ms debounce on date inputs to reduce API calls
- **Query Caching**: 30-second stale time for efficient data revalidation
- **Duplicate Prevention**: Prevents multiple replay requests for the same job
- **Optimistic Updates**: Instant UI feedback without waiting for server response

### Security & Privacy
- **Email Masking**: Recipient emails are masked (e.g., u***@example.com)
- **Text Truncation**: Long failure reasons are truncated to 50 characters
- **Job ID Truncation**: Job IDs are truncated for cleaner display
- **Type Safety**: Full TypeScript coverage with strict types

## File Structure

```
app/(dashboard)/admin/notifications/
├── page.tsx                          # Main page component
├── __tests__/
│   └── page.test.tsx                 # Comprehensive page tests
└── README.md                         # This file

app/lib/
├── api/
│   ├── admin.ts                      # API client methods (updated)
│   └── __tests__/
│       └── admin-notifications.test.ts  # API tests
├── types/
│   └── notification-jobs.ts          # TypeScript type definitions
└── hooks/
    ├── useDebounce.ts                # Debounce hook
    └── __tests__/
        └── useDebounce.test.ts       # Hook tests

app/components/admin/
└── ConfirmDialog.tsx                 # Reusable confirmation dialog
```

## API Integration

### Endpoints Used

#### GET `/admin/notifications/dlq`
Fetches failed notification jobs with pagination and filters.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `failedAfter` (ISO string): Filter jobs failed after this date
- `failedBefore` (ISO string): Filter jobs failed before this date

**Response:**
```typescript
{
  jobs: FailedNotificationJob[];
  total: number;
  page: number;
  limit: number;
}
```

#### POST `/admin/notifications/dlq/:jobId/replay`
Replays a failed notification job.

**Body:**
```typescript
{
  reason?: string;  // Optional reason for replay
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
  jobId: string;
}
```

## Type Definitions

### FailedNotificationJob
```typescript
interface FailedNotificationJob {
  id: string;
  name: string;
  attemptsMade: number;
  maxAttempts: number;
  failedReason: string | null;
  failedAt: string | null;
  createdAt: string | null;
  channel: string;
  recipientEmail?: string;
}
```

### FailedJobsFilter
```typescript
interface FailedJobsFilter {
  status?: 'failed' | 'all';
  startDate?: string;
  endDate?: string;
  minRetries?: number;
  page?: number;
  limit?: number;
}
```

## Testing

### Test Coverage
- **Page Component**: 100% coverage of rendering, filtering, pagination, and replay actions
- **API Client**: Full coverage of API methods against the shared runtime client
- **useDebounce Hook**: Comprehensive hook behavior testing
- **Error Handling**: All error scenarios covered

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- notifications/page.test.tsx
```

### Test Files
- `page.test.tsx`: Page component tests (rendering, filtering, pagination, replay)
- `admin-notifications.test.ts`: API client tests
- `useDebounce.test.ts`: Debounce hook tests

## Usage

### Accessing the Page
Navigate to `/admin/notifications` in the admin dashboard.

### Filtering Jobs
1. **Status Filter**: Select "Failed Only" or "All"
2. **Date Range**: Set start and/or end dates
3. **Min Retries**: Filter by minimum retry count

Filters are debounced by 500ms to reduce API calls.

### Replaying a Job
1. Click the "Replay" button for a job
2. Confirm the action in the dialog
3. The job will be replayed and the UI will update optimistically
4. If the replay fails, the UI will rollback and show an error

### Pagination
- Use "Previous" and "Next" buttons to navigate pages
- Current page and total pages are displayed
- Pagination controls are hidden when there's only one page

## Error Handling

### Network Errors
- Displays error message with retry button
- Automatically retries failed requests with exponential backoff (via API client)

### Replay Errors
- Rolls back optimistic updates
- Surfaces failure feedback in the shared toast system
- Prevents duplicate replay attempts

### Empty States
- Shows friendly message when no jobs are found
- Provides context about the current filter state

## Accessibility

- Semantic HTML structure
- Proper ARIA labels
- Keyboard navigation support
- Focus management in dialogs
- Screen reader friendly

## Performance Optimizations

1. **Debounced Filters**: Reduces API calls during rapid filter changes
2. **Query Caching**: Reuses cached data for 30 seconds
3. **Optimistic Updates**: Instant UI feedback without waiting for server
4. **Pagination**: Loads only necessary data
5. **Memoization**: Filters are memoized to prevent unnecessary re-renders

## Development Notes

This page now uses the shared runtime admin API client only:
- No browser `localStorage` mock toggles
- No legacy mock-admin fallback branch
- Frontend tests should mock `apiClient` directly

## Future Enhancements

- [ ] Bulk replay actions
- [ ] Export to CSV
- [ ] Real-time updates via WebSocket
- [ ] Advanced search/filtering
- [ ] Job details modal
- [ ] Retry history timeline
- [ ] Notification preferences integration
- [ ] Performance metrics dashboard

## Contributing

When making changes:
1. Update types in `notification-jobs.ts`
2. Add/update API methods in `admin.ts`
3. Write comprehensive tests
4. Update this README
5. Ensure all tests pass
6. Check TypeScript compilation
7. Verify mobile responsiveness

## License

See project root LICENSE file.
