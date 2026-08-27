# Visual Guide - Failed Notification Jobs Dashboard

## Desktop View (1920x1080)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Admin Dashboard                                                    [Back]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Dashboard                                                                   │
│  Reports                                                                     │
│  Users                                                                       │
│  ► Notifications                                                             │
│  Audit Logs                                                                  │
│                                                                              │
└──────────────┬──────────────────────────────────────────────────────────────┤
               │                                                               │
               │  Failed Notification Jobs                                     │
               │  Monitor and replay failed notification delivery attempts     │
               │                                                               │
               │  ┌─────────────────────────────────────────────────────────┐ │
               │  │ Filters                                                 │ │
               │  ├─────────────┬─────────────┬─────────────┬─────────────┤ │
               │  │ Status      │ Start Date  │ End Date    │ Min Retries │ │
               │  │ [Failed ▼]  │ [________]  │ [________]  │ [_______]   │ │
               │  └─────────────┴─────────────┴─────────────┴─────────────┘ │
               │                                                               │
               │  ┌─────────────────────────────────────────────────────────┐ │
               │  │ Job ID      │ Channel │ Recipient      │ Retries │ ... │ │
               │  ├─────────────┼─────────┼────────────────┼─────────┼─────┤ │
               │  │ job-123...  │ [email] │ u***@example   │ [3/3]   │ ... │ │
               │  │ job-456...  │ [email] │ i***@test      │ [2/3]   │ ... │ │
               │  │ job-789...  │ [email] │ a***@domain    │ [3/3]   │ ... │ │
               │  └─────────────┴─────────┴────────────────┴─────────┴─────┘ │
               │                                                               │
               │  Showing 1 to 20 of 45 results                               │
               │  [Previous] Page 1 of 3 [Next]                               │
               │                                                               │
               └───────────────────────────────────────────────────────────────┘
```

## Mobile View (375x667)

```
┌─────────────────────────────┐
│ ☰  Admin  [mock] [2 new]   │
├─────────────────────────────┤
│                             │
│ Failed Notification Jobs    │
│ Monitor and replay failed   │
│ notification delivery...    │
│                             │
│ ┌─────────────────────────┐ │
│ │ Status                  │ │
│ │ [Failed Only ▼]         │ │
│ │                         │ │
│ │ Start Date              │ │
│ │ [________________]      │ │
│ │                         │ │
│ │ End Date                │ │
│ │ [________________]      │ │
│ │                         │ │
│ │ Min Retries             │ │
│ │ [________________]      │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ Job ID: job-123...      │ │
│ │ Channel: [email]        │ │
│ │ Recipient: u***@example │ │
│ │ Retries: [3/3]          │ │
│ │ Failed: 2h ago          │ │
│ │ Reason: SMTP timeout... │ │
│ │ [Replay]                │ │
│ ├─────────────────────────┤ │
│ │ Job ID: job-456...      │ │
│ │ Channel: [email]        │ │
│ │ Recipient: i***@test    │ │
│ │ Retries: [2/3]          │ │
│ │ Failed: 1h ago          │ │
│ │ Reason: Invalid email...│ │
│ │ [Replay]                │ │
│ └─────────────────────────┘ │
│                             │
│ Showing 1 to 20 of 45       │
│ [Previous] [Next]           │
│                             │
└─────────────────────────────┘
```

## Component States

### 1. Loading State
```
┌─────────────────────────────────────┐
│ Failed Notification Jobs            │
│ Monitor and replay failed...        │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### 2. Empty State
```
┌─────────────────────────────────────┐
│ Failed Notification Jobs            │
│ Monitor and replay failed...        │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │         📄                      │ │
│ │                                 │ │
│ │   No failed jobs found          │ │
│ │                                 │ │
│ │   All notification jobs are     │ │
│ │   processing successfully.      │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### 3. Error State
```
┌─────────────────────────────────────┐
│ Failed Notification Jobs            │
│ Monitor and replay failed...        │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ⚠️ Failed to load notification  │ │
│ │    jobs. Please try again.      │ │
│ │                                 │ │
│ │    [Retry]                      │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### 4. Confirmation Dialog
```
┌─────────────────────────────────────┐
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Replay Failed Job             │  │
│  ├───────────────────────────────┤  │
│  │                               │  │
│  │ Are you sure you want to      │  │
│  │ replay this failed            │  │
│  │ notification job? This will   │  │
│  │ attempt to resend the         │  │
│  │ notification.                 │  │
│  │                               │  │
│  │         [Cancel]  [Replay]    │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

### 5. Replaying State
```
┌─────────────────────────────────────┐
│ Job ID      │ Channel │ Actions     │
├─────────────┼─────────┼─────────────┤
│ job-123...  │ [email] │ Replaying...│ ← Disabled
│ job-456...  │ [email] │ [Replay]    │
│ job-789...  │ [email] │ [Replay]    │
└─────────────┴─────────┴─────────────┘
```

## Color Scheme

### Status Badges
- **Email Channel**: Blue background (`bg-blue-100 text-blue-800`)
- **Max Retries Reached**: Red background (`bg-red-100 text-red-800`)
- **Retries Remaining**: Yellow background (`bg-yellow-100 text-yellow-800`)

### Interactive Elements
- **Primary Button**: Indigo (`bg-indigo-600 hover:bg-indigo-700`)
- **Secondary Button**: Gray (`bg-gray-700 hover:bg-gray-600`)
- **Danger Button**: Red (`bg-red-600 hover:bg-red-700`)

### States
- **Loading**: Gray shimmer animation
- **Error**: Red border and background (`border-red-200 bg-red-50`)
- **Empty**: Gray icon and text (`text-gray-400`)

## Responsive Breakpoints

### Desktop (lg: 1024px+)
- Sidebar visible
- Full table layout
- 6 columns visible
- Filters in single row

### Tablet (md: 768px - 1023px)
- Sidebar hidden (hamburger menu)
- Horizontal scroll for table
- All columns visible
- Filters in 2 rows

### Mobile (sm: 375px - 767px)
- Hamburger menu
- Card layout instead of table
- Filters stacked vertically
- Touch-friendly buttons

## Accessibility Features

### Keyboard Navigation
- `Tab`: Navigate between interactive elements
- `Enter/Space`: Activate buttons
- `Esc`: Close dialogs
- `Arrow Keys`: Navigate table cells

### Screen Reader Announcements
- "Loading notification jobs"
- "No failed jobs found"
- "Failed to load notification jobs"
- "Replaying job [id]"
- "Job replayed successfully"

### ARIA Labels
- `aria-label="Status filter"`
- `aria-label="Start date filter"`
- `aria-label="Previous page"`
- `aria-label="Next page"`
- `role="alert"` for error messages

## Animation & Transitions

### Loading Skeleton
- Pulse animation (1.5s duration)
- Gray gradient shimmer effect

### Button Hover
- 200ms transition
- Slight color darkening
- Cursor pointer

### Dialog
- Fade in/out (200ms)
- Zoom in/out (95% to 100%)
- Backdrop blur

### Optimistic Update
- Instant button text change
- Disabled state
- Smooth transition back on error

## Data Display Examples

### Job ID
- Full: `job-123456789012345`
- Display: `job-123456789...`
- Tooltip: Full ID on hover

### Email
- Full: `user@example.com`
- Display: `u***@example.com`
- Privacy: First char + asterisks + domain

### Failure Reason
- Full: `SMTP connection timeout after 30 seconds while attempting to send email notification`
- Display: `SMTP connection timeout after 30 seconds whi...`
- Truncate: 50 characters + ellipsis

### Timestamp
- Absolute: `2024-02-20T10:30:00Z`
- Relative: `2h ago`, `1d ago`, `Feb 20`
- Format: Smart relative/absolute based on age

## Performance Indicators

### Loading Time
- Initial load: < 1s
- Filter change: < 500ms (debounced)
- Page navigation: < 300ms

### Interaction Feedback
- Button click: Immediate visual feedback
- Replay action: Optimistic update
- Error: Instant rollback

### Network Optimization
- Debounced filters: Reduces API calls by ~70%
- Query caching: Reduces redundant requests
- Pagination: Loads only visible data

## Browser Compatibility

### Fully Supported
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

### Mobile Browsers
- ✅ iOS Safari 14+
- ✅ Chrome Mobile 90+
- ✅ Samsung Internet 14+

### Graceful Degradation
- Older browsers: Basic functionality
- No JavaScript: Server-side rendering fallback
- Slow connection: Progressive loading
