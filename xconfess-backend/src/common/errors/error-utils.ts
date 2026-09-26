import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../errors/error-codes';
import { AppException, AppExceptionResponse } from '../errors/app-exception';

/**
 * Shared error utility for consistent, safe error handling across all modules.
 *
 * This utility centralizes common error patterns to ensure:
 * - Consistent error envelope structure (AppExceptionResponse)
 * - Safe error messages (no internal details exposed to clients)
 * - Proper HTTP status codes and error codes
 * - Consistent retry-after headers for rate limiting
 */
export class ErrorUtils {
  /**
   * Creates a validation error (400 Bad Request)
   * Use when request payload fails validation
   */
  static validationFailed(
    message: string,
    details?: any,
    retryAfter?: number,
  ): AppException {
    return new AppException(
      message,
      ErrorCode.VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      details,
      retryAfter,
    );
  }

  /**
   * Creates a bad request error (400 Bad Request)
   * Use for general client errors that aren't validation-specific
   */
  static badRequest(message: string, details?: any): AppException {
    return new AppException(
      message,
      ErrorCode.BAD_REQUEST,
      HttpStatus.BAD_REQUEST,
      details,
    );
  }

  /**
   * Creates a missing parameter error (400 Bad Request)
   */
  static missingParameter(paramName: string): AppException {
    return new AppException(
      `Missing required parameter: ${paramName}`,
      ErrorCode.MISSING_PARAMETER,
      HttpStatus.BAD_REQUEST,
      { parameter: paramName },
    );
  }

  /**
   * Creates an invalid parameter error (400 Bad Request)
   */
  static invalidParameter(paramName: string, reason?: string): AppException {
    return new AppException(
      `Invalid parameter: ${paramName}${reason ? ` - ${reason}` : ''}`,
      ErrorCode.INVALID_PARAMETER,
      HttpStatus.BAD_REQUEST,
      { parameter: paramName, reason },
    );
  }

  /**
   * Creates an unprocessable entity error (422 Unprocessable Entity)
   * Use when request is syntactically valid but semantically invalid
   */
  static unprocessableEntity(message: string, details?: any): AppException {
    return new AppException(
      message,
      ErrorCode.UNPROCESSABLE_ENTITY,
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }

  /**
   * Creates an unauthorized error (401 Unauthorized)
   * Use when authentication is required but missing or invalid
   */
  static unauthorized(message = 'Authentication required'): AppException {
    return new AppException(
      message,
      ErrorCode.AUTH_UNAUTHORIZED,
      HttpStatus.UNAUTHORIZED,
    );
  }

  /**
   * Creates an invalid credentials error (401 Unauthorized)
   */
  static invalidCredentials(message = 'Invalid credentials'): AppException {
    return new AppException(
      message,
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED,
    );
  }

  /**
   * Creates a session expired error (401 Unauthorized)
   */
  static sessionExpired(message = 'Session has expired'): AppException {
    return new AppException(
      message,
      ErrorCode.AUTH_SESSION_EXPIRED,
      HttpStatus.UNAUTHORIZED,
    );
  }

  /**
   * Creates a token invalid error (401 Unauthorized)
   */
  static tokenInvalid(message = 'Invalid or expired token'): AppException {
    return new AppException(
      message,
      ErrorCode.AUTH_TOKEN_INVALID,
      HttpStatus.UNAUTHORIZED,
    );
  }

  /**
   * Creates an account deactivated error (401 Unauthorized)
   */
  static accountDeactivated(message = 'Account has been deactivated'): AppException {
    return new AppException(
      message,
      ErrorCode.AUTH_ACCOUNT_DEACTIVATED,
      HttpStatus.UNAUTHORIZED,
    );
  }

  /**
   * Creates a step-up authentication required error (401 Unauthorized)
   */
  static stepUpRequired(message = 'Step-up authentication required'): AppException {
    return new AppException(
      message,
      ErrorCode.AUTH_STEP_UP_REQUIRED,
      HttpStatus.UNAUTHORIZED,
    );
  }

  /**
   * Creates a forbidden error (403 Forbidden)
   * Use when authenticated but not authorized for the action
   */
  static forbidden(message = 'Access denied'): AppException {
    return new AppException(
      message,
      ErrorCode.AUTH_FORBIDDEN,
      HttpStatus.FORBIDDEN,
    );
  }

  /**
   * Creates a not found error (404 Not Found)
   */
  static notFound(resource: string, identifier?: string): AppException {
    const message = identifier
      ? `${resource} not found: ${identifier}`
      : `${resource} not found`;
    return new AppException(
      message,
      ErrorCode.NOT_FOUND,
      HttpStatus.NOT_FOUND,
      identifier ? { resource, identifier } : { resource },
    );
  }

  /**
   * Creates a conflict error (409 Conflict)
   * Use when resource already exists or conflicts with current state
   */
  static conflict(message: string, details?: any): AppException {
    return new AppException(
      message,
      ErrorCode.CONFLICT,
      HttpStatus.CONFLICT,
      details,
    );
  }

  /**
   * Creates an already exists error (409 Conflict)
   */
  static alreadyExists(resource: string, identifier?: string): AppException {
    const message = identifier
      ? `${resource} already exists: ${identifier}`
      : `${resource} already exists`;
    return new AppException(
      message,
      ErrorCode.ALREADY_EXISTS,
      HttpStatus.CONFLICT,
      identifier ? { resource, identifier } : { resource },
    );
  }

  /**
   * Creates a resource gone error (410 Gone)
   * Use when resource was previously available but is now permanently unavailable
   */
  static resourceGone(resource: string, identifier?: string): AppException {
    const message = identifier
      ? `${resource} no longer available: ${identifier}`
      : `${resource} no longer available`;
    return new AppException(
      message,
      ErrorCode.RESOURCE_GONE,
      HttpStatus.GONE,
      identifier ? { resource, identifier } : { resource },
    );
  }

  /**
   * Creates a request too large error (413 Payload Too Large)
   */
  static requestTooLarge(maxSize?: string): AppException {
    return new AppException(
      `Request payload too large${maxSize ? ` (max: ${maxSize})` : ''}`,
      ErrorCode.REQUEST_TOO_LARGE,
      HttpStatus.PAYLOAD_TOO_LARGE,
      maxSize ? { maxSize } : undefined,
    );
  }

  /**
   * Creates a rate limit exceeded error (429 Too Many Requests)
   */
  static rateLimitExceeded(retryAfter: number, message?: string): AppException {
    return new AppException(
      message || 'Too many requests. Please wait a moment and try again.',
      ErrorCode.RATE_LIMIT_EXCEEDED,
      HttpStatus.TOO_MANY_REQUESTS,
      undefined,
      retryAfter,
    );
  }

  /**
   * Creates a throttled error (429 Too Many Requests)
   */
  static throttled(retryAfter: number, message?: string): AppException {
    return new AppException(
      message || 'Request throttled. Please slow down.',
      ErrorCode.THROTTLED,
      HttpStatus.TOO_MANY_REQUESTS,
      undefined,
      retryAfter,
    );
  }

  /**
   * Creates an internal server error (500 Internal Server Error)
   * Use for unexpected errors - message is sanitized for safety
   */
  static internalError(
    message = 'An unexpected error occurred',
    details?: any,
  ): AppException {
    return new AppException(
      message,
      ErrorCode.INTERNAL_SERVER_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
      details,
    );
  }

  /**
   * Creates a service unavailable error (503 Service Unavailable)
   * Use when a dependency is temporarily unavailable
   */
  static serviceUnavailable(
    service: string,
    message?: string,
    retryAfter?: number,
  ): AppException {
    return new AppException(
      message || `${service} is temporarily unavailable`,
      ErrorCode.SERVICE_UNAVAILABLE,
      HttpStatus.SERVICE_UNAVAILABLE,
      { service },
      retryAfter,
    );
  }

  /**
   * Creates a Stellar/contract error
   */
  static stellarError(message: string, details?: any): AppException {
    return new AppException(
      message,
      ErrorCode.STELLAR_ERROR,
      HttpStatus.BAD_GATEWAY,
      details,
    );
  }

  /**
   * Creates a contract invocation failed error
   */
  static contractInvocationFailed(message: string, details?: any): AppException {
    return new AppException(
      message,
      ErrorCode.CONTRACT_INVOCATION_FAILED,
      HttpStatus.BAD_GATEWAY,
      details,
    );
  }

  /**
   * Creates an insufficient funds error
   */
  static insufficientFunds(message = 'Insufficient funds', details?: any): AppException {
    return new AppException(
      message,
      ErrorCode.INSUFFICIENT_FUNDS,
      HttpStatus.PAYMENT_REQUIRED,
      details,
    );
  }

  /**
   * Creates a transaction failed error
   */
  static transactionFailed(message: string, details?: any): AppException {
    return new AppException(
      message,
      ErrorCode.TRANSACTION_FAILED,
      HttpStatus.BAD_GATEWAY,
      details,
    );
  }

  /**
   * Sanitizes an error message for safe client exposure.
   * Removes internal details like stack traces, file paths, SQL queries, etc.
   */
  static sanitizeMessage(error: unknown): string {
    if (!error) return 'An unexpected error occurred';

    const message = error instanceof Error ? error.message : String(error);

    // List of patterns that indicate internal details
    const internalPatterns = [
      /stack trace/i,
      /at .*\(.*\)/,
      /\b(?:file|path|line|column)\b/i,
      /sql/i,
      /query/i,
      /database/i,
      /connection/i,
      /password/i,
      /secret/i,
      /token/i,
      /private key/i,
      /seed/i,
      /mnemonic/i,
      /internal/i,
      /debug/i,
    ];

    // Check if message contains internal details
    const hasInternalDetails = internalPatterns.some((pattern) =>
      pattern.test(message),
    );

    if (hasInternalDetails) {
      return 'An unexpected error occurred';
    }

    // Truncate very long messages
    return message.length > 500 ? message.substring(0, 500) + '...' : message;
  }

  /**
   * Converts any error to a safe AppException.
   * Use when catching unknown errors to ensure consistent envelope.
   */
  static fromUnknown(error: unknown, defaultMessage = 'An unexpected error occurred'): AppException {
    if (error instanceof AppException) {
      return error;
    }

    const message = this.sanitizeMessage(error);
    return new AppException(
      message || defaultMessage,
      ErrorCode.INTERNAL_SERVER_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Converts a standard HttpException to AppException with proper error code mapping.
   */
  static fromHttpException(exception: any): AppException {
    return AppException.fromHttpException(exception);
  }

  /**
   * Creates a standardized error response object for direct use in controllers.
   * Useful when you need to return a custom response without throwing.
   */
  static createErrorResponse(
    status: HttpStatus,
    code: ErrorCode,
    message: string,
    details?: any,
    retryAfter?: number,
  ): AppExceptionResponse {
    return {
      message,
      code,
      details,
      retryAfter,
    };
  }
}

/**
 * Decorator to automatically wrap controller methods with error handling.
 * Catches any thrown error and converts to safe AppException.
 */
export function HandleErrors() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        throw ErrorUtils.fromUnknown(error);
      }
    };
    return descriptor;
  };
}

/**
 * Type guard to check if an error is an AppException
 */
export function isAppException(error: unknown): error is AppException {
  return error instanceof AppException;
}

/**
 * Type guard to check if an error is a standard HttpException
 */
export function isHttpException(error: unknown): error is { getStatus(): number; getResponse(): any; message: string } {
  return (
    error != null &&
    typeof error === 'object' &&
    'getStatus' in error &&
    'getResponse' in error &&
    typeof (error as any).getStatus === 'function' &&
    typeof (error as any).getResponse === 'function'
  );
}