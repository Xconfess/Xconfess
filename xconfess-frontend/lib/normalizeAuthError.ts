/**
 * Normalize backend auth/session errors into a consistent shape.
 * Enables AuthProvider and proxy routes to handle retries uniformly.
 */

export type ErrorType = 'TRANSIENT' | 'TERMINAL';

export interface NormalizedAuthError {
  type: ErrorType;
  code: string;
  message: string;
  retryable: boolean;
  originalStatus?: number;
  originalError?: any;
}

/**
 * Categorizes an error as TRANSIENT (can retry) or TERMINAL (should not retry).
 * 
 * TRANSIENT (retryable: true):
 *   - Network errors / timeouts
 *   - 5xx server errors
 * 
 * TERMINAL (retryable: false):
 *   - 401 Unauthorized (invalid session/token)
 *   - 403 Forbidden (no permission)
 *   - 4xx client errors (except 429)
 */
export function normalizeAuthError(error: any): NormalizedAuthError {
  const status = extractStatus(error);
  const message = extractMessage(error);

  // Network errors and timeouts => TRANSIENT
  if (isNetworkError(error)) {
    return {
      type: 'TRANSIENT',
      code: 'NETWORK_ERROR',
      message: 'Network error. Please check your connection.',
      retryable: true,
      originalStatus: status,
      originalError: error,
    };
  }

  // 5xx server errors => TRANSIENT
  if (status >= 500) {
    return {
      type: 'TRANSIENT',
      code: `SERVER_ERROR_${status}`,
      message: message || 'Server error. Please try again.',
      retryable: true,
      originalStatus: status,
      originalError: error,
    };
  }

  // 401 Unauthorized => TERMINAL
  if (status === 401) {
    return {
      type: 'TERMINAL',
      code: 'INVALID_SESSION',
      message: 'Your session has expired. Please log in again.',
      retryable: false,
      originalStatus: status,
      originalError: error,
    };
  }

  // 403 Forbidden => TERMINAL
  if (status === 403) {
    return {
      type: 'TERMINAL',
      code: 'FORBIDDEN',
      message: 'You do not have permission to access this resource.',
      retryable: false,
      originalStatus: status,
      originalError: error,
    };
  }

  // 429 Too Many Requests => TRANSIENT
  if (status === 429) {
    return {
      type: 'TRANSIENT',
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait and try again.',
      retryable: true,
      originalStatus: status,
      originalError: error,
    };
  }

  // Other 4xx => TERMINAL (client errors)
  if (status >= 400 && status < 500) {
    return {
      type: 'TERMINAL',
      code: `CLIENT_ERROR_${status}`,
      message: message || `Client error: ${status}`,
      retryable: false,
      originalStatus: status,
      originalError: error,
    };
  }

  // Fallback
  return {
    type: 'TERMINAL',
    code: 'UNKNOWN_ERROR',
    message: message || 'An unknown error occurred.',
    retryable: false,
    originalStatus: status,
    originalError: error,
  };
}

export function getAuthErrorMessage(error: NormalizedAuthError): string {
  return error.message;
}

/**
 * Extract HTTP status code from various error types.
 */
function extractStatus(error: any): number {
  if (typeof error === 'object' && error !== null) {
    if ('status' in error) return error.status;
    if ('statusCode' in error) return error.statusCode;
    if ('response' in error && error.response?.status) return error.response.status;
  }
  return 500; // Default to server error
}

/**
 * Extract meaningful message from error object.
 */
function extractMessage(error: any): string {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';

  // Check common message properties
  if ('message' in error && typeof error.message === 'string') {
    return error.message;
  }
  if ('error' in error) {
    if (typeof error.error === 'string') return error.error;
    if (typeof error.error === 'object' && 'message' in error.error) {
      return error.error.message;
    }
  }
  if ('data' in error && typeof error.data === 'object' && 'message' in error.data) {
    return error.data.message;
  }

  return '';
}

/**
 * Check if error is a network-level issue (not HTTP response).
 */
function isNetworkError(error: any): boolean {
  if (!error || typeof error !== 'object') return false;

  const message = (error.message || '').toLowerCase();
  const name = (error.name || '').toLowerCase();

  // Network request failed (no response)
  if (message.includes('network') || name === 'networkerror') return true;
  if (message.includes('econnrefused') || message.includes('enotfound')) return true;

  // Timeout
  if (message.includes('timeout') || message.includes('econnaborted')) return true;
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true;

  // Fetch API timeout/abort
  if (name === 'aborterror') return true;

  return false;
}

/**
 * Helper to retry an async operation with exponential backoff.
 * Only retries if error is categorized as retryable.
 * 
 * @param operation - The async function to execute
 * @param maxRetries - Maximum retry attempts (default 1 for auth operations)
 * @param delayMs - Initial delay in ms (default 100)
 */
export async function retryAuthOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 1,
  delayMs: number = 100
): Promise<T> {
  let lastError: NormalizedAuthError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const normalized = normalizeAuthError(error);
      lastError = normalized;

      // Don't retry TERMINAL errors
      if (!normalized.retryable || attempt === maxRetries) {
        throw normalized;
      }

      // Exponential backoff before retry
      const delay = delayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This shouldn't be reached, but just in case
  throw lastError || {
    type: 'TERMINAL',
    code: 'UNKNOWN_ERROR',
    message: 'Operation failed.',
    retryable: false,
  };
}
