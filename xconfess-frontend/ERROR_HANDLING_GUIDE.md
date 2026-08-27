# Comprehensive Error Handling Guide

This document outlines how to use the error handling system implemented in the xConfess application.

## Overview

The error handling system consists of several components:

1. **Error Handler Utility** - Centralized error parsing and logging
2. **Toast Notifications** - User-friendly feedback messages
3. **Error Boundary** - React error boundary for component crashes
4. **Loading States** - Spinner and skeleton components
5. **Custom Hooks** - `useApiError`, `useAsyncForm` for easy integration
6. **UI Components** - `ErrorState`, `RetryButton` for displaying errors

## Quick Start

### 1. Toast Notifications

```tsx
'use client';

import { useGlobalToast } from '@/app/components/common/Toast';

export function MyComponent() {
  const toast = useGlobalToast();

  const handleClick = async () => {
    try {
      // Do something
      toast.success('Operation completed!');
    } catch (error) {
      toast.error('Something went wrong');
    }
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

### 2. Using useApiError Hook

```tsx
'use client';

import { useApiError } from '@/app/lib/hooks/useApiError';
import apiClient from '@/app/lib/api/client';

export function MyForm() {
  const { handleError, handleSuccess } = useApiError({
    context: 'My Form',
    showToast: true,
  });

  const onSubmit = async (data: any) => {
    try {
      const response = await apiClient.post('/api/endpoint', data);
      handleSuccess('Data saved successfully');
    } catch (error) {
      handleError(error, 'Failed to save data');
    }
  };

  return <form onSubmit={onSubmit}>{/* form content */}</form>;
}
```

### 3. Using useAsyncForm Hook

```tsx
'use client';

import { useAsyncForm } from '@/app/lib/hooks/useAsyncForm';
import LoadingSpinner from '@/app/components/common/LoadingSpinner';

export function MyForm() {
  const { execute, loading, error, reset } = useAsyncForm(
    async () => {
      const response = await fetch('/api/endpoint', { method: 'POST' });
      return response.json();
    },
    {
      onSuccess: () => {
        console.log('Success!');
      },
      successMessage: 'Data saved!',
    }
  );

  return (
    <div>
      <button onClick={execute} disabled={loading}>
        {loading ? 'Saving...' : 'Save'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
```

### 4. Error Boundary Usage

The error boundary is already wrapped around your entire app in `layout.tsx`. To use it in specific sections:

```tsx
'use client';

import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';

export function MyComponent() {
  return (
    <ErrorBoundary
      onReset={() => {
        // Reset component state if needed
      }}
    >
      <SomeComponentThatMightError />
    </ErrorBoundary>
  );
}
```

### 5. Loading States

#### Spinner

```tsx
import LoadingSpinner from '@/app/components/common/LoadingSpinner';

// Inline spinner
<LoadingSpinner size="md" message="Loading..." />

// Full screen overlay
<LoadingSpinner fullScreen size="lg" message="Please wait..." />
```

#### Skeletons

```tsx
import SkeletonLoader, { CardSkeleton, TableSkeleton } from '@/app/components/common/SkeletonLoader';

// Generic skeleton
<SkeletonLoader count={3} lines={2} />

// Card skeleton
<CardSkeleton count={5} />

// Table skeleton
<TableSkeleton rows={10} cols={4} />
```

### 6. Error Display Components

#### Error State

```tsx
import ErrorState from '@/app/components/common/ErrorState';

<ErrorState
  error="Failed to load data"
  onRetry={async () => {
    await fetchData();
  }}
  title="Load Error"
  description="Unable to fetch the requested data"
/>
```

#### Retry Button

```tsx
import RetryButton from '@/app/components/common/RetryButton';

<RetryButton
  onRetry={async () => {
    await retryOperation();
  }}
  label="Try Again"
  variant="primary"
  error={errorMessage}
/>
```

## Error Handler Utility

The error handler utility provides functions for parsing different error types:

```tsx
import {
  getErrorMessage,
  getErrorCode,
  getErrorStatusCode,
  isNetworkError,
  isServerError,
  isClientError,
  isUnauthorized,
  isForbidden,
  logError,
} from '@/app/lib/utils/errorHandler';

// Parse error information
const message = getErrorMessage(error);
const code = getErrorCode(error);
const status = getErrorStatusCode(error);

// Check error type
if (isNetworkError(error)) {
  // Handle network error
}

if (isUnauthorized(error)) {
  // Handle 401
}

// Log errors for debugging
logError(error, 'MyComponent', { additionalContext: 'value' });
```

## API Client Error Handling

The API client automatically handles:

- **401 Unauthorized**: Clears tokens and redirects to login
- **429 Too Many Requests**: Exponential backoff retry
- **5xx Server Errors**: Automatic retry with backoff
- **Network Errors**: Automatic retry with backoff
- **Error Logging**: All errors are logged to console/error tracking

### Retry Logic

The API client uses exponential backoff:
- 1st retry: 2^1 = 2 seconds
- 2nd retry: 2^2 = 4 seconds
- 3rd retry: 2^3 = 8 seconds

Maximum 3 retries before giving up.

## Best Practices

### 1. Always Provide User-Friendly Messages

❌ Bad:
```tsx
toast.error('ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:5000');
```

✅ Good:
```tsx
toast.error('Unable to connect to server. Please check your connection.');
```

### 2. Log Errors for Debugging

```tsx
logError(error, 'UserFormSubmit', {
  userId: user.id,
  formData: sanitizedData,
});
```

### 3. Use Appropriate Error Types

- `success()` - Operation completed
- `error()` - Something failed
- `warning()` - Needs attention
- `info()` - Informational message

### 4. Provide Retry Options

```tsx
{error && (
  <ErrorState
    error={errorMessage}
    onRetry={fetchData}
    showRetry={true}
  />
)}
```

### 5. Handle Loading States

```tsx
{loading && <LoadingSpinner message="Loading data..." />}
{error && <ErrorState error={error} onRetry={refetch} />}
{data && <DataComponent data={data} />}
```

## Error Types Handled

### Network Errors
- Connection refused
- Timeout (30 seconds default)
- DNS resolution failure

### HTTP Errors
- **400** - Bad Request (validation error)
- **401** - Unauthorized (token expired)
- **403** - Forbidden (no permission)
- **404** - Not Found
- **409** - Conflict
- **413** - Payload Too Large
- **422** - Unprocessable Entity
- **429** - Too Many Requests (rate limit)
- **500** - Server Error
- **502** - Bad Gateway
- **503** - Service Unavailable

## Development vs Production

### Development
- Detailed error messages shown
- Full error stack traces visible
- Console logging enabled

### Production
- User-friendly messages
- No technical details exposed
- Errors sent to tracking service (if configured)

## Error Tracking Service

To enable error tracking, set the environment variable:

```env
NEXT_PUBLIC_ERROR_TRACKING_URL=https://your-error-tracking.com/api/errors
```

Errors will be automatically sent as JSON to this endpoint.

## Testing Error Scenarios

```tsx
// Test network error
const mockError = new Error('Network Error');

// Test API error
import { AxiosError } from 'axios';
const apiError = new AxiosError('Request failed', '400');

// Use error handler
const message = getErrorMessage(apiError);
```

## Common Issues

### Toast not showing
- Make sure `ToastProvider` is in layout.tsx ✓
- Check if `useGlobalToast()` is called in a client component

### Error boundary not catching errors
- Must be in a client component (`'use client'`)
- Only catches render-time errors, not async errors

### Retries not working
- Check network condition
- Verify API endpoint is accessible
- Check retry count limits

## Related Files

- `/app/lib/utils/errorHandler.ts` - Error parsing utilities
- `/app/lib/hooks/useToast.ts` - Toast hook
- `/app/lib/hooks/useApiError.ts` - API error hook
- `/app/lib/hooks/useAsyncForm.ts` - Form submission hook
- `/app/lib/api/client.ts` - API client with interceptors
- `/app/components/common/Toast.tsx` - Toast provider and display
- `/app/components/common/ErrorBoundary.tsx` - Error boundary
- `/app/components/common/LoadingSpinner.tsx` - Loading spinner
- `/app/components/common/SkeletonLoader.tsx` - Skeleton loaders
- `/app/components/common/ErrorState.tsx` - Error display component
- `/app/components/common/RetryButton.tsx` - Retry button component
