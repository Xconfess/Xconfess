# Implementation Verification Guide

## What Was Done

✅ **Applied normalized error handling to all auth proxy routes**
- File: `app/api/auth/session/route.ts`
- Pattern: Import normalizeAuthError, use fetchBackendWithRetry(), avoid TERMINAL retries

✅ **Updated API client to handle normalized errors**
- File: `app/lib/api/authService.ts`
- Pattern: Detect normalized error shape, use getAuthErrorMessage() for UI text

✅ **Updated AuthProvider to react to normalized errors**
- File: `app/lib/providers/AuthProvider.tsx`
- Pattern: Detect TERMINAL errors, clear session, redirect to login

## Quick Verification

### In Route Handler (`/api/auth/session`)

```typescript
// 1. Import the utility
import { normalizeAuthError, NormalizedAuthError } from "@/lib/normalizeAuthError";

// 2. Create retry helper
async function fetchBackendWithRetry(url, options) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const normalized = normalizeAuthError({
          ...errorData,
          status: response.status,
        });
        
        // 3. Check type before retrying
        if (normalized.type === "TERMINAL") {
          return { success: false, normalized }; // Don't retry
        }
        
        // Can retry TRANSIENT
        if (attempt < MAX_RETRIES) {
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
      }
    } catch (error) {
      const normalized = normalizeAuthError(error);
      if (normalized.type === "TERMINAL") {
        return { success: false, normalized }; // Don't retry
      }
    }
  }
}

// 4. Return normalized error shape
function createErrorResponse(normalized: NormalizedAuthError) {
  return new Response(
    JSON.stringify({
      type: normalized.type,
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      originalStatus: normalized.originalStatus,
    }),
    { status: normalized.originalStatus || 500 }
  );
}
```

### In API Client (`authService.ts`)

```typescript
// 1. Import utilities
import { NormalizedAuthError, getAuthErrorMessage } from "@/lib/normalizeAuthError";

export const authApi = {
  async login(credentials) {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const body = await response.json();
      
      // 2. Detect normalized error from proxy route
      if (isNormalizedAuthError(body)) {
        const normalized = body as NormalizedAuthError;
        const message = getAuthErrorMessage(normalized); // User-friendly
        
        // 3. Throw AppError with normalized details
        throw new AppError(message, normalized.code, response.status, {
          normalized, // Store for AuthProvider to inspect
        });
      }
    }
    
    return response.json();
  },

  async getCurrentUser() {
    const response = await fetch('/api/auth/session');
    if (!response.ok) {
      const body = await response.json();
      
      // Same pattern as login
      if (isNormalizedAuthError(body)) {
        // Handle normalized error
      }
    }
    return response.json().then(d => d.user);
  },
};

function isNormalizedAuthError(body: any): body is NormalizedAuthError {
  return (
    body?.type === 'TRANSIENT' || body?.type === 'TERMINAL'
  ) && 'code' in body && 'message' in body && 'retryable' in body;
}
```

### In AuthProvider (`AuthProvider.tsx`)

```typescript
// 1. Import router and types
import { useRouter } from 'next/navigation';
import { AppError } from '../utils/errorHandler';
import { NormalizedAuthError } from '@/lib/normalizeAuthError';

export function AuthProvider({ children }) {
  const router = useRouter();

  // 2. Handle TERMINAL auth errors
  const handleTerminalAuthError = useCallback((error: AppError) => {
    const normalized = error.details?.normalized as NormalizedAuthError | undefined;
    
    if (normalized?.type === "TERMINAL") {
      // 3. Clear session immediately
      setStoreUser(null);
      storeLogout();
      setState({ user: null, isAuthenticated: false });
      
      // 4. Redirect to login
      if (!window.location.pathname.includes('/login')) {
        router.push('/login');
      }
    }
  }, []);

  // 5. Call handler on auth errors
  const checkAuth = useCallback(async () => {
    try {
      const user = await authApi.getCurrentUser();
      // Success path
    } catch (error) {
      if (error instanceof AppError) {
        handleTerminalAuthError(error); // Will redirect on TERMINAL
      }
    }
  }, []);

  const login = async (credentials) => {
    try {
      const response = await authApi.login(credentials);
      // Success path
    } catch (error) {
      if (error instanceof AppError) {
        handleTerminalAuthError(error); // Will redirect on TERMINAL
      }
      throw error;
    }
  };
}
```

## Error Handling Decision Tree

```
Error from Backend
        ↓
normalizeAuthError()
        ↓
    ┌───┴────┐
    │        │
TRANSIENT  TERMINAL
    │        │
    │    Clear session
    │    Redirect /login
    │
Max retries?
    ↓
   Yes  → Return error to client
    │
   No  → Retry with backoff
        → Go back to fetch
```

## Testing Scenarios

### Test 1: Successful Login
```bash
POST /api/auth/session
{ "email": "user@example.com", "password": "correct" }
→ Backend returns 200 with user data
→ fetchBackendWithRetry returns { success: true, data: user }
→ authApi.login() returns user
→ AuthProvider setState({ user, isAuthenticated: true })
✅ User logged in
```

### Test 2: Invalid Credentials
```bash
POST /api/auth/session
{ "email": "user@example.com", "password": "wrong" }
→ Backend returns 401 "Unauthorized"
→ normalizeAuthError() → { type: "TERMINAL", code: "INVALID_SESSION", retryable: false }
→ fetchBackendWithRetry returns { success: false, normalized }
→ createErrorResponse() → { type: "TERMINAL", ... }
→ authApi.login() throws AppError with normalized details
→ AuthProvider.handleTerminalAuthError() called
→ Clears session, redirects to /login
✅ User redirected to login with error message
```

### Test 3: Network Timeout
```bash
POST /api/auth/session
→ fetch() timeout
→ normalizeAuthError(error) → { type: "TRANSIENT", code: "NETWORK_ERROR", retryable: true }
→ fetchBackendWithRetry: attempt 1 failed, wait 500ms
→ fetchBackendWithRetry: attempt 2 succeeds
→ Returns user data
✅ Transparent retry, user sees success
```

### Test 4: Server Error (5xx)
```bash
GET /api/auth/session
→ Backend returns 503 Service Unavailable
→ normalizeAuthError() → { type: "TRANSIENT", code: "SERVER_ERROR_503", retryable: true }
→ fetchBackendWithRetry: attempt 1 failed, wait 500ms
→ fetchBackendWithRetry: attempt 2 fails again (max retries reached)
→ Returns error after retries exhausted
→ authApi.getCurrentUser() throws AppError
→ AuthProvider: NO REDIRECT (not TERMINAL)
→ User sees "Server error. Please try again later."
✅ User can manually retry later
```

## Deployment Checklist

- [ ] Code compiles without errors
- [ ] Test login with valid credentials
- [ ] Test login with invalid credentials → redirects to login
- [ ] Test session verification with valid token
- [ ] Test session verification with expired token → redirects to login
- [ ] Test with network throttling (DevTools)
- [ ] Verify no infinite retry loops
- [ ] Check console for error logs in development
- [ ] Verify no sensitive data in error messages
