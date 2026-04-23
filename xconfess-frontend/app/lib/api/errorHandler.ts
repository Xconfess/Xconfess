export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
  retryable: boolean;
}

export interface ErrorResponse {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

export function normalizeError(error: unknown): ApiError {
  if (error instanceof Response) {
    return {
      code: 'RESPONSE_ERROR',
      message: error.statusText || 'Request failed',
      status: error.status,
      retryable: error.status >= 500 || error.status === 429,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      status: 0,
      retryable: false,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
    status: 0,
    retryable: false,
  };
}

export function parseErrorResponse(error: unknown): ErrorResponse {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return error as ErrorResponse;
  }
  return { message: 'An unexpected error occurred' };
}

export function getUserFriendlyMessage(error: ApiError): string {
  const messages: Record<string, string> = {
    NETWORK_ERROR: 'Connection error. Please check your internet connection.',
    TIMEOUT_ERROR: 'The request took too long. Please try again.',
    RATE_LIMIT_ERROR: 'Too many requests. Please wait a moment.',
    AUTH_ERROR: 'Your session has expired. Please log in again.',
    VALIDATION_ERROR: 'Please check your input and try again.',
    SERVER_ERROR: 'Something went wrong on our end. Please try again later.',
    UNKNOWN_ERROR: 'Something unexpected happened. Please try again.',
  };
  return messages[error.code] || error.message;
}

export function shouldRetry(error: ApiError): boolean {
  return error.retryable;
}

export function getRetryDelay(attempt: number, baseDelay = 1000): number {
  const delay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * delay;
  return Math.min(delay + jitter, 30000);
}