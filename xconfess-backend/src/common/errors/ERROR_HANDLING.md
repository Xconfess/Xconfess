# Error Handling Documentation

## Overview

The XConfess backend uses a standardized error envelope across all endpoints to ensure consistent error handling for frontend clients.

## Error Envelope Structure

All error responses follow this structure:

```typescript
interface ErrorResponse {
  statusCode: number;        // HTTP status code
  code: ErrorCode;           // Machine-readable error code
  message: string;           // Human-readable error message (safe for clients)
  details?: any;             // Optional structured details for debugging
  retryAfter?: number;       // Seconds until retry (for 429 responses)
  timestamp: string;         // ISO 8601 timestamp
  path: string;              // Request path
  requestId: string;         // Correlation ID for tracing
}
```

## Error Codes

### Authentication & Authorization
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_UNAUTHORIZED` | 401 | Authentication required |
| `AUTH_FORBIDDEN` | 403 | Access denied |
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid username/password |
| `AUTH_SESSION_EXPIRED` | 401 | Session has expired |
| `AUTH_TOKEN_INVALID` | 401 | Invalid or expired token |
| `AUTH_ACCOUNT_DEACTIVATED` | 401 | Account deactivated |
| `AUTH_STEP_UP_REQUIRED` | 401 | Step-up authentication required |
| `AUTH_STEP_UP_EXPIRED` | 401 | Step-up challenge expired |
| `AUTH_STEP_UP_INVALID` | 401 | Step-up challenge invalid |

### Validation & Request Errors
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | General client error |
| `VALIDATION_FAILED` | 400 | Request validation failed |
| `MISSING_PARAMETER` | 400 | Required parameter missing |
| `INVALID_PARAMETER` | 400 | Parameter value invalid |
| `UNPROCESSABLE_ENTITY` | 422 | Semantically invalid request |
| `REQUEST_TOO_LARGE` | 413 | Payload exceeds limit |

### Resource Errors
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RESOURCE_GONE` | 410 | Resource permanently unavailable |
| `ALREADY_EXISTS` | 409 | Resource already exists |

### Rate Limiting
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `THROTTLED` | 429 | Request throttled |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |

### Stellar / Contract Errors
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `STELLAR_ERROR` | 502 | Stellar network error |
| `CONTRACT_INVOCATION_FAILED` | 502 | Smart contract call failed |
| `INSUFFICIENT_FUNDS` | 402 | Insufficient XLM balance |
| `TRANSACTION_FAILED` | 502 | Transaction failed |

### Internal Errors
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Dependency temporarily unavailable |
| `UNKNOWN_ERROR` | 500 | Unknown error |

## Usage Examples

### Using ErrorUtils (Recommended)

```typescript
import { ErrorUtils } from 'src/common/errors';

// Validation errors
throw ErrorUtils.validationFailed('Email is required', { field: 'email' });
throw ErrorUtils.missingParameter('userId');
throw ErrorUtils.invalidParameter('limit', 'must be between 1 and 100');

// Authentication errors
throw ErrorUtils.unauthorized('Please log in');
throw ErrorUtils.invalidCredentials();
throw ErrorUtils.tokenInvalid();
throw ErrorUtils.forbidden('Admin access required');

// Resource errors
throw ErrorUtils.notFound('Confession', confessionId);
throw ErrorUtils.conflict('Email already registered');
throw ErrorUtils.alreadyExists('Tag', tagName);

// Rate limiting
throw ErrorUtils.rateLimitExceeded(60, 'Too many login attempts');

// Server errors
throw ErrorUtils.internalError('Database connection failed');
throw ErrorUtils.serviceUnavailable('Redis', 'Cache service down', 30);

// Stellar errors
throw ErrorUtils.insufficientFunds('Need 0.01 XLM for fee');
throw ErrorUtils.transactionFailed('Transaction rejected by network');
```

### Converting Unknown Errors

```typescript
try {
  await riskyOperation();
} catch (error) {
  // Automatically sanitizes message and wraps in AppException
  throw ErrorUtils.fromUnknown(error);
}
```

### Direct Response Creation (Without Throwing)

```typescript
@Get('example')
async example(@Res() res: Response) {
  const errorResponse = ErrorUtils.createErrorResponse(
    HttpStatus.NOT_FOUND,
    ErrorCode.NOT_FOUND,
    'Resource not found',
    { resource: 'User', identifier: '123' }
  );
  return res.status(HttpStatus.NOT_FOUND).json(errorResponse);
}
```

## Frontend Integration

The frontend API client can parse the common structure:

```typescript
interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: any;
  retryAfter?: number;
}

async function handleApiError(error: ApiError) {
  switch (error.code) {
    case 'AUTH_UNAUTHORIZED':
    case 'AUTH_TOKEN_INVALID':
    case 'AUTH_SESSION_EXPIRED':
      redirectToLogin();
      break;
    case 'RATE_LIMIT_EXCEEDED':
    case 'THROTTLED':
      showRetryToast(error.retryAfter);
      break;
    case 'VALIDATION_FAILED':
      showFieldErrors(error.details);
      break;
    default:
      showGenericError(error.message);
  }
}
```

## Safety Guidelines

1. **Never expose internal details** - ErrorUtils.sanitizeMessage() automatically removes stack traces, SQL queries, file paths, secrets, etc.

2. **Use specific error codes** - Prefer `VALIDATION_FAILED` over generic `BAD_REQUEST` for validation errors.

3. **Include retry-after for 429** - Always provide `retryAfter` seconds for rate limit errors.

4. **Use details for structured data** - Include field names, resource identifiers, etc. in `details` for programmatic handling.

5. **Don't leak sensitive info** - The error filters automatically redact secrets from logs.

## Migration Guide

Replace direct NestJS exception throws:

```typescript
// Before
throw new BadRequestException('Invalid email');
throw new NotFoundException('User not found');
throw new ConflictException('Email exists');

// After
throw ErrorUtils.invalidParameter('email', 'invalid format');
throw ErrorUtils.notFound('User', userId);
throw ErrorUtils.alreadyExists('User', email);
```