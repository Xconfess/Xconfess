# Auth Error Normalization - Delivery Summary

## What's Delivered

### 1. Utility: `lib/normalizeAuthError.ts`

**Already exists** with complete implementation:
- `normalizeAuthError()` - Convert any error to consistent shape
- `retryAuthOperation()` - Auto-retry with backoff (max 1 retry)
- Helper functions for extracting status, message, and detecting network errors

**Error Output Shape:**
```typescript
{
  type: "TRANSIENT" | "TERMINAL",
  code: string,
  message: string,
  retryable: boolean,
  originalStatus?: number
}
```

### 2. Example Route: `app/api/auth/session/route.updated.example.ts`

Demonstrates the recommended pattern:
- ✅ `fetchBackendWithRetry()` helper with built-in retry logic
- ✅ Checks `normalized.type` before retrying (avoids TERMINAL retry loop)
- ✅ Max 1 retry for TRANSIENT errors with exponential backoff (500ms → 1s)
- ✅ Clear session on 401 invalid session
- ✅ Normalized error response for AuthProvider consumption

### 3. Usage Guide: `AUTH_ERROR_NORMALIZATION_GUIDE.md`

Complete implementation docs:
- Pattern examples for proxy routes
- AuthProvider integration code
- Helper function usage
- Error flow diagrams
- Testing examples

## Quick Start

### In Proxy Routes

```typescript
import { normalizeAuthError } from "@/lib/normalizeAuthError";

// Catch any error, normalize it
const normalized = normalizeAuthError(error, { status: response.status });

// Check type before retry
if (normalized.type === "TERMINAL") {
  return createErrorResponse(normalized); // Don't retry
}

// TRANSIENT: safe to retry
```

### In AuthProvider

```typescript
// Receive normalized error from proxy route
const normalized = await res.json();

if (normalized.type === "TERMINAL" && normalized.code === "INVALID_SESSION") {
  clearAuth();
  redirectToLogin();
}
```

## Error Mapping

| Error | Type | Retryable | Action |
|-------|------|-----------|--------|
| Network error, timeout | TRANSIENT | ✅ Yes | Retry 1x with backoff |
| 5xx server error | TRANSIENT | ✅ Yes | Retry 1x with backoff |
| 429 rate limit | TRANSIENT | ✅ Yes | Retry 1x with backoff |
| **401 invalid session** | **TERMINAL** | **❌ No** | **Clear auth, redirect** |
| **403 forbidden** | **TERMINAL** | **❌ No** | **Show error, don't retry** |
| Other 4xx errors | TERMINAL | ❌ No | Show error, don't retry |

## Files to Update

Apply the pattern from `route.updated.example.ts` to other auth routes:

- `app/api/auth/session/route.ts` (POST/GET/DELETE)
- `app/api/auth/refresh/route.ts` (if exists)
- `app/api/auth/logout/route.ts` (if exists)
- Any other auth/session proxy routes

## Benefits

✅ **Consistent error handling** across all auth routes  
✅ **No retry loops** for invalid sessions (TERMINAL errors)  
✅ **Automatic retries** for transient failures (network, timeouts, 5xx)  
✅ **Reusable by AuthProvider** - same error shape used everywhere  
✅ **Type-safe** - TypeScript interfaces prevent errors  
✅ **Testable** - easy to mock and test error scenarios  

## Next Steps

1. Review `route.updated.example.ts` for the recommended pattern
2. Apply it to all auth proxy routes in `/app/api/auth/*`
3. Update AuthProvider to handle `normalized.type` and `normalized.code`
4. Test with network throttling to verify retry behavior
5. Add unit tests using examples from the guide
