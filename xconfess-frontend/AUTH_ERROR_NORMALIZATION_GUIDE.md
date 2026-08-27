# Auth Error Normalization Guide

Consistent, reusable error handling for auth/session proxy routes and AuthProvider.

## Overview

**File:** `lib/normalizeAuthError.ts`

Normalizes backend auth/session errors into a consistent shape:

```typescript
interface NormalizedAuthError {
  type: "TRANSIENT" | "TERMINAL";
  code: string;
  message: string;
  retryable: boolean;
  originalStatus?: number;
  originalError?: any;
}
```

### Error Categories

| Type | Retryable | Examples | Action |
|------|-----------|----------|--------|
| **TRANSIENT** | ✅ Yes | Network errors, timeouts, 5xx, 429 rate limits | Retry with backoff (max 1) |
| **TERMINAL** | ❌ No | 401/403 invalid session, 4xx client errors | Show user, don't retry |

## Usage in Proxy Routes

### Pattern 1: Simple Fetch with Retry

```typescript
import { normalizeAuthError } from "@/lib/normalizeAuthError";

export async function POST(request: Request) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const normalized = normalizeAuthError(errorData, {
        status: response.status,
      });

      // Check type before deciding to retry
      if (normalized.type === "TERMINAL") {
        // Don't retry: 401 invalid session, 403 forbidden, etc.
        return createErrorResponse(normalized);
      }

      // TRANSIENT: can retry once
      // ... implement retry logic
    }

    return NextResponse.json(data);
  } catch (error) {
    const normalized = normalizeAuthError(error);
    // Handle network errors, timeouts, etc.
    return createErrorResponse(normalized);
  }
}
```

### Pattern 2: Helper Function with Built-in Retry

See `route.updated.example.ts` for full implementation.

```typescript
async function fetchBackendWithRetry(url: string, options: RequestInit = {}) {
  const MAX_RETRIES = 1;
  let lastNormalized: NormalizedAuthError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const normalized = normalizeAuthError(errorData, {
          status: response.status,
        });

        // TERMINAL: don't retry
        if (normalized.type === "TERMINAL") {
          return { success: false, normalized };
        }

        lastNormalized = normalized;

        // TRANSIENT: can retry with backoff
        if (attempt < MAX_RETRIES) {
          const delayMs = 500 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        return { success: false, normalized };
      }

      return { success: true, data: await response.json() };
    } catch (error) {
      const normalized = normalizeAuthError(error);
      if (normalized.type === "TERMINAL") {
        return { success: false, normalized };
      }

      lastNormalized = normalized;
      if (attempt < MAX_RETRIES) {
        const delayMs = 500 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      return { success: false, normalized };
    }
  }

  return { success: false, normalized: lastNormalized };
}
```

## Usage in AuthProvider

### Client-side Error Handling

```typescript
import { useCallback } from "react";
import { NormalizedAuthError } from "@/lib/normalizeAuthError";
import { useToast } from "@/hooks/useToast"; // or your toast library

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();

  const handleAuthError = useCallback(
    (normalized: NormalizedAuthError) => {
      // Get user-friendly message
      const message = getAuthErrorMessage(normalized);

      // Show toast
      toast.error(message);

      // Handle TERMINAL auth errors (invalid session, forbidden)
      if (normalized.type === "TERMINAL") {
        switch (normalized.code) {
          case "INVALID_SESSION":
            // Clear auth state, redirect to login
            clearAuth();
            redirectToLogin();
            break;

          case "FORBIDDEN":
            // User lacks permissions
            redirectToAccessDenied();
            break;
        }
      }

      // TRANSIENT errors: user can retry (client handles this)
    },
    [toast]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          const normalized = normalizeAuthError(errorData, {
            status: res.status,
          });

          handleAuthError(normalized);
          throw normalized;
        }

        const data = await res.json();
        setUser(data.user);
      } catch (error) {
        if (error instanceof NormalizedAuthError) {
          // Already handled
          throw error;
        }

        const normalized = normalizeAuthError(error);
        handleAuthError(normalized);
        throw normalized;
      }
    },
    [handleAuthError]
  );

  return (
    <AuthContext.Provider value={{ login, user }}>
      {children}
    </AuthContext.Provider>
  );
}
```

## Helper Functions

### Get User-Friendly Message

```typescript
import { getAuthErrorMessage } from "@/lib/normalizeAuthError";

const normalized = normalizeAuthError(error);
const message = getAuthErrorMessage(normalized);
// "Your session has expired. Please log in again."
```

### Determine Retry Behavior

```typescript
import { getAuthRetryConfig } from "@/lib/normalizeAuthError";

const config = getAuthRetryConfig(normalized, attemptNumber);
// { shouldRetry: true, delay: 500 }
// { shouldRetry: false, delay: 0 }
```

### Auto-Retry Operation

```typescript
import { retryAuthOperation } from "@/lib/normalizeAuthError";

try {
  const data = await retryAuthOperation(
    () => fetch(`${API_URL}/auth/session`).then((r) => r.json()),
    1, // max 1 retry
    100 // initial delay in ms
  );
} catch (error) {
  const normalized = normalizeAuthError(error);
  // Handle failure
}
```

## Implementation Checklist

- [ ] Update all auth proxy routes (`/app/api/auth/*`) to use `normalizeAuthError`
- [ ] Use `normalized.type` to avoid retrying TERMINAL errors
- [ ] Implement max 1 retry for TRANSIENT errors with exponential backoff
- [ ] Update AuthProvider to consume normalized errors
- [ ] Use `getAuthErrorMessage()` for user-facing toast/UI messages
- [ ] Handle 401 INVALID_SESSION errors (clear auth state, redirect to login)
- [ ] Add error logging in development mode (see route example)
- [ ] Test with network throttling to verify retry behavior

## Example Error Flows

### Network Timeout (TRANSIENT)

```
1. Fetch times out
2. normalizeAuthError() → { type: "TRANSIENT", code: "NETWORK_ERROR", retryable: true }
3. Retry after 500ms
4. Success or TERMINAL error
```

### Invalid Session 401 (TERMINAL)

```
1. Backend returns 401 "Invalid token"
2. normalizeAuthError() → { type: "TERMINAL", code: "INVALID_SESSION", retryable: false }
3. Clear session cookie (proxy route)
4. AuthProvider clears auth state
5. Redirect to /auth/login
```

### Server Error 503 (TRANSIENT)

```
1. Backend returns 503 Service Unavailable
2. normalizeAuthError() → { type: "TRANSIENT", code: "SERVER_ERROR_503", retryable: true }
3. Retry after exponential backoff
4. Success or further retries exhaust
```

### Rate Limit 429 (TRANSIENT)

```
1. Backend returns 429 Too Many Requests
2. normalizeAuthError() → { type: "TRANSIENT", code: "RATE_LIMITED", retryable: true }
3. Retry after 500ms backoff
4. Success after brief pause
```

## Testing

```typescript
import { normalizeAuthError } from "@/lib/normalizeAuthError";

// Test network error
const netErr = normalizeAuthError(new Error("Network Error"));
expect(netErr.type).toBe("TRANSIENT");
expect(netErr.retryable).toBe(true);

// Test 401 invalid session
const authErr = normalizeAuthError(
  { message: "Unauthorized" },
  { status: 401 }
);
expect(authErr.type).toBe("TERMINAL");
expect(authErr.retryable).toBe(false);
expect(authErr.code).toBe("INVALID_SESSION");

// Test 5xx server error
const serverErr = normalizeAuthError(
  { message: "Service Unavailable" },
  { status: 503 }
);
expect(serverErr.type).toBe("TRANSIENT");
expect(serverErr.retryable).toBe(true);
```
