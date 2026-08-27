# Error Handling System - Quick Reference

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   USER APPLICATION                      │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Components use Error Handling Hooks                     │
│  ├── useGlobalToast()           [Toast notifications]   │
│  ├── useApiError()              [API error handling]    │
│  └── useAsyncForm()             [Form submissions]      │
│                                                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    ERROR BOUNDARY                        │
│      (Catches render-time errors)                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   API CLIENT                             │
│  (lib/api/client.ts - Axios instance)                   │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Request Interceptor                                    │
│  ├── Add Auth Token                                     │
│  └── Add Headers                                        │
│                                                           │
│  Response Interceptor                                   │
│  ├── Check 401 (Unauthorized) → Logout                 │
│  ├── Check 429 (Rate Limit) → Retry with Backoff       │
│  ├── Check 5xx (Server Error) → Retry with Backoff     │
│  ├── Check Network Error → Retry with Backoff          │
│  ├── Log Error                                          │
│  └── Pass other errors to component                     │
│                                                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   ERROR HANDLER                          │
│  (lib/utils/errorHandler.ts)                            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Parse Error → Get Message                              │
│      ↓                                                   │
│  Get Error Code (UNAUTHORIZED, FORBIDDEN, etc.)         │
│      ↓                                                   │
│  Get HTTP Status Code (400, 401, 500, etc.)             │
│      ↓                                                   │
│  Log Error (if enabled)                                 │
│      ↓                                                   │
│  Return Error Response                                  │
│                                                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              COMPONENT DISPLAY                           │
│                                                           │
│  Toast Notification ────→ Auto-dismisses after N sec   │
│  Loading Spinner ───────→ Shows while loading          │
│  Error State ───────────→ Shows with retry button      │
│  Skeleton Loader ───────→ Placeholder while loading    │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
START
  ↓
Try API Call
  │
  ├─ Success → Show Success Toast → END
  │
  └─ Error Occurs
      ↓
    Error Boundary?
      │
      ├─ Yes → Catch Error → Display Error UI → Allow Reset
      │
      └─ No → API Client Interceptor
          ↓
        Error Type?
          │
          ├─ Network Error → Retry (exp. backoff) → Max 3 retries
          ├─ 401 → Clear Token → Redirect to Login
          ├─ 429 → Retry (exp. backoff) → Max 3 retries
          ├─ 5xx → Retry (exp. backoff) → Max 3 retries
          │
          └─ Other → Pass to Component
              ↓
            Component Handler?
              │
              ├─ useAsyncForm → Update state + Show Toast
              ├─ useApiError → Call handleError()
              │
              └─ Manual → Display ErrorState component
                  ↓
                Retry Button?
                  │
                  ├─ Yes → Restart Flow
                  └─ No → Display Error
                      ↓
                    END
```

## Hook Comparison Chart

| Hook | Use Case | Features |
|------|----------|----------|
| `useGlobalToast()` | Any notification | success, error, warning, info |
| `useApiError()` | API calls | Error logging, toast, 401 handling |
| `useAsyncForm()` | Form submission | Loading state, error handling |
| `useErrorHandler()` | Error utilities | Parse error, get message |

## Component Selection Guide

```
Need to display...?

→ Success/Error Message
  └─ Use: useGlobalToast()
     Example: toast.success('Saved!')

→ Form Error
  └─ Use: Show inline error + useAsyncForm()
     Example: {error && <p>{error}</p>}

→ Page Load Error
  └─ Use: ErrorState component
     Example: <ErrorState error={err} onRetry={retry} />

→ Loading Data
  └─ Use: LoadingSpinner or SkeletonLoader
     Example: <CardSkeleton count={3} />

→ Component Crash
  └─ Use: ErrorBoundary wrapper
     Example: <ErrorBoundary><Component /></ErrorBoundary>

→ Retry Failed Request
  └─ Use: RetryButton component
     Example: <RetryButton onRetry={fetchData} />
```

## Common Patterns

### Pattern 1: API Call with Toast
```tsx
const toast = useGlobalToast();
try {
  await apiClient.post('/endpoint', data);
  toast.success('Done!');
} catch (err) {
  toast.error(getErrorMessage(err));
}
```

### Pattern 2: Form with Loading
```tsx
const { execute, loading, error } = useAsyncForm(
  () => apiClient.post('/form', formData),
  { successMessage: 'Saved!' }
);
<button disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
```

### Pattern 3: Data Fetch with States
```tsx
const [data, setData] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

useEffect(() => {
  const fetch = async () => {
    try {
      setLoading(true);
      setData(await apiClient.get('/data'));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  fetch();
}, []);

if (loading) return <CardSkeleton />;
if (error) return <ErrorState error={error} onRetry={fetch} />;
return <div>{/* data */}</div>;
```

### Pattern 4: Protected Section
```tsx
<ErrorBoundary>
  <ProblematicComponent />
</ErrorBoundary>
```

## Status Code Quick Reference

| Code | Meaning | Handling | Message |
|------|---------|----------|---------|
| 200 | OK | ✅ Success | Operation successful |
| 400 | Bad Request | ❌ Validation | Check your input |
| 401 | Unauthorized | 🔄 Logout | Session expired, login again |
| 403 | Forbidden | ❌ Denied | No permission |
| 404 | Not Found | ❌ Missing | Resource not found |
| 409 | Conflict | ❌ Conflict | Data conflict |
| 429 | Rate Limited | 🔄 Retry | Too many requests |
| 500 | Server Error | 🔄 Retry | Server error |
| 503 | Unavailable | 🔄 Retry | Service temporarily unavailable |

## Error Code Quick Reference

```
Error Codes Used:

NETWORK_ERROR       → No internet connection
UNAUTHORIZED        → 401 - Token expired/invalid
FORBIDDEN          → 403 - No permission
NOT_FOUND          → 404 - Resource missing
CONFLICT           → 409 - Data conflict
PAYLOAD_TOO_LARGE  → 413 - File too large
UNPROCESSABLE_ENTITY → 422 - Validation error
TOO_MANY_REQUESTS  → 429 - Rate limited
SERVER_ERROR       → 500 - Server problem
BAD_GATEWAY        → 502 - Gateway error
SERVICE_UNAVAILABLE → 503 - Maintenance
VALIDATION_ERROR   → 400 - Invalid input
UNKNOWN_ERROR      → Unknown problem
```

## Retry Strategy

```
Request Fails
    ↓
Retryable?
    │
    ├─ Network Error → YES
    ├─ 429 (Rate Limit) → YES
    ├─ 5xx (Server) → YES
    │
    └─ Other → NO → Pass to Component
                    ↓
                Timeout?
                    │
                    ├─ No → Show Error
                    └─ Yes → Show TimeoutError

For Retryable Errors:

Attempt 1 → Fail
    ↓
Wait 2^1 = 2 seconds
    ↓
Attempt 2 → Fail
    ↓
Wait 2^2 = 4 seconds
    ↓
Attempt 3 → Fail
    ↓
Wait 2^3 = 8 seconds
    ↓
Attempt 4 → Fail
    ↓
Max Retries Exceeded → Pass Error to Component
```

## Usage Checklist

Before using in components:

- [ ] Is component using `'use client'`?
- [ ] Are you wrapping in `ErrorBoundary`?
- [ ] Is `ToastProvider` in layout?
- [ ] Are you showing loading states?
- [ ] Are you showing error states?
- [ ] Are you providing retry options?
- [ ] Are you using user-friendly messages?
- [ ] Are you logging errors with context?
- [ ] Are you handling 401 specially?
- [ ] Are you disabled buttons during loading?

## File Import Guide

```tsx
// Error utilities
import { 
  getErrorMessage, 
  logError 
} from '@/app/lib/utils/errorHandler';

// Toast
import { useGlobalToast } from '@/app/components/common/Toast';

// API error handling
import { useApiError } from '@/app/lib/hooks/useApiError';

// Form submission
import { useAsyncForm } from '@/app/lib/hooks/useAsyncForm';

// Components
import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';
import LoadingSpinner from '@/app/components/common/LoadingSpinner';
import SkeletonLoader, { CardSkeleton } from '@/app/components/common/SkeletonLoader';
import ErrorState from '@/app/components/common/ErrorState';
import RetryButton from '@/app/components/common/RetryButton';

// API Client
import apiClient from '@/app/lib/api/client';
```

## Environment Setup

### In layout.tsx:
```tsx
import { ToastProvider } from '@/app/components/common/Toast';
import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';

<html>
  <body>
    <ErrorBoundary>
      <AuthProvider>
        <QueryProvider>
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </QueryProvider>
      </AuthProvider>
    </ErrorBoundary>
  </body>
</html>
```

### In .env (optional):
```env
NEXT_PUBLIC_ERROR_TRACKING_URL=https://tracking.service.com/errors
```

## Performance Tips

1. **Use Skeleton Loaders** instead of spinners for data
2. **Lazy load** error components
3. **Debounce** retry attempts
4. **Limit** concurrent requests
5. **Cache** successful responses
6. **Clear** old toasts before adding new
7. **Disable** form buttons during submission
8. **Use** React.memo for error components

## Accessibility

All components include:
- ✅ ARIA labels
- ✅ Semantic HTML
- ✅ Keyboard navigation
- ✅ Focus management
- ✅ Color not only indicator
- ✅ Screen reader support

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| Toast not showing | Missing provider | Add ToastProvider to layout |
| Error boundary not catching | Async error | Move to component boundary |
| Infinite retries | No max check | Check retry count (max 3) |
| Loading never clears | Missing finally | Ensure finally block runs |
| 401 loops | Token not cleared | Check localStorage clearing |
| Stale state | Race condition | Use cleanup function |

## Development Tips

### Enable Error Logging
```tsx
logError(error, 'MyComponent', { debugInfo: value });
// Shows in console during development
```

### See Error Details
```tsx
// In dev, ErrorBoundary shows full stack trace
// Click "Error Details" to expand
```

### Test Error Scenarios
```tsx
// Simulate network error: DevTools → Network → Offline
// Simulate 401: Return 401 from API
// Simulate timeout: Set to 10ms in client.ts (test only!)
```

---

**Quick Links:**
- 📖 [Full Guide](./ERROR_HANDLING_GUIDE.md)
- 💡 [Examples](./EXAMPLES.md)
- 🏗️ [Architecture](./IMPLEMENTATION_SUMMARY.md)
- ✅ [Checklist](./MIGRATION_CHECKLIST.md)
- 📘 [README](./ERROR_HANDLING_README.md)

**Last Updated:** January 30, 2026
