import axios from 'axios';

export interface ErrorResponse {
  message: string;
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export const STATUS_ERROR_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your input.',
  401: 'Your session has expired. Please log in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'This action conflicts with existing data.',
  413: 'The file is too large. Please upload a smaller file.',
  422: 'Please check your input and try again.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Server error. Please try again later.',
  502: 'Bad gateway. Please try again later.',
  503: 'Service unavailable. Please try again later.',
};

/** Shown on failed sign-in (wrong credentials, etc.) — never raw API/auth strings. */
export const LOGIN_ATTEMPT_FAILED_MESSAGE =
  'Unable to sign in. Please check your email and password.';

const JWT_LIKE =
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/**
 * Removes JWT-shaped fragments and bearer tokens from free text for logs/beacons.
 */
export const redactSensitiveStrings = (input: string): string => {
  return input
    .replace(JWT_LIKE, '[REDACTED_JWT]')
    .replace(/bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');
};

function looksLikeInternalAuthLeak(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(m)) return true;
  const lower = m.toLowerCase();
  if (/^invalid token\.?$/.test(lower)) return true;
  if (/^not authenticated/.test(lower)) return true;
  if (/malformed (jwt|token)/i.test(m)) return true;
  if (/^(jwt|json web token)\s/.test(lower)) return true;
  if (lower.includes('bearer ') && m.length < 200) return true;
  return false;
}

export const STATUS_ERROR_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'SERVER_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

export const getStatusMessage = (statusCode: number): string => {
  return STATUS_ERROR_MESSAGES[statusCode] || 'An unexpected error occurred. Please try again.';
};

export const getStatusCodeString = (statusCode: number): string => {
  return STATUS_ERROR_CODES[statusCode] || 'UNKNOWN_ERROR';
};

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'AppError';
  }
}

/**
 * Technical detail for logs and support — redacted, safe to ship to analytics without secrets.
 */
export const getDiagnosticMessageForLog = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    const raw =
      typeof data === 'object' && data !== null
        ? JSON.stringify(data)
        : String(data ?? '');
    const line = `[axios] ${error.response?.status ?? 'no_response'} ${error.config?.method ?? ''} ${error.config?.url ?? ''} ${raw.slice(0, 500)}`;
    return redactSensitiveStrings(line);
  }
  if (error instanceof AppError) {
    const detailStr = JSON.stringify(error.details ?? {}).slice(0, 500);
    return redactSensitiveStrings(
      `[AppError] ${error.statusCode} ${error.code} ${error.message} ${detailStr}`
    );
  }
  if (error instanceof Error) {
    return redactSensitiveStrings(error.message);
  }
  return redactSensitiveStrings(String(error));
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof AppError) {
    if (error.statusCode === 401) {
      const hasLoginBody =
        error.details &&
        typeof error.details === 'object' &&
        'responseBody' in error.details;
      return hasLoginBody ? LOGIN_ATTEMPT_FAILED_MESSAGE : STATUS_ERROR_MESSAGES[401];
    }
    if (error.statusCode === 403) {
      return STATUS_ERROR_MESSAGES[403];
    }
    return error.message;
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const defaultMessage = status ? getStatusMessage(status) : 'Network error. Please check your internet connection.';
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    const apiMessage = data?.message || data?.error;
    const isAuthFailure = status === 401 || status === 403;
    if (
      !isAuthFailure &&
      apiMessage &&
      typeof apiMessage === 'string' &&
      apiMessage.trim().length > 0
    ) {
      return apiMessage;
    }
    if (error.message === 'Network Error') {
      return 'Network error. Please check your internet connection.';
    }
    return defaultMessage;
  }

  if (error instanceof Error) {
    const raw = error.message || 'An unexpected error occurred. Please try again.';
    if (looksLikeInternalAuthLeak(raw)) {
      return STATUS_ERROR_MESSAGES[401];
    }
    return raw;
  }

  return 'An unexpected error occurred. Please try again.';
};

export const getErrorCode = (error: unknown): string => {
  if (error instanceof AppError) {
    return error.code;
  }

  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;
    return statusCode ? getStatusCodeString(statusCode) : 'NETWORK_ERROR';
  }

  return 'UNKNOWN_ERROR';
};

export const getErrorStatusCode = (error: unknown): number => {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  if (axios.isAxiosError(error)) {
    return error.response?.status ?? 500;
  }

  return 500;
};

/**
 * Extract the backend `requestId` from an API error response.
 * Issue #801 — used to surface the correlation ID in failure toasts.
 */
export const extractRequestId = (error: unknown): string | undefined => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | undefined;
    if (!data) return undefined;
    const id = data['requestId'] ?? data['request_id'] ?? data['correlationId'];
    return typeof id === 'string' ? id : undefined;
  }
  if (error instanceof AppError) {
    const id = error.details?.['requestId'] ?? error.details?.['correlationId'];
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
};

export const toAppError = (error: unknown, contextMessage?: string): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 500;
    const message = getErrorMessage(error);
    const code = getErrorCode(error);
    const responseData = error.response?.data as Record<string, unknown> | undefined;
    const requestId =
      responseData?.['requestId'] ??
      responseData?.['request_id'] ??
      (error.config as any)?.correlationId;
    const details: Record<string, unknown> = {
      url: error.config?.url,
      method: error.config?.method,
      correlationId: (error.config as any)?.correlationId,
      responseData,
      // Normalised key so toast consumers only need to check `requestId`.
      ...(typeof requestId === 'string' ? { requestId } : {}),
    };
    return new AppError(message, code, status, details);
  }

  if (error instanceof Error) {
    const status = 500;
    const message = contextMessage || error.message || 'An unexpected error occurred. Please try again.';
    return new AppError(message, error.name || 'UNKNOWN_ERROR', status, { stack: error.stack });
  }

  return new AppError(
    contextMessage || 'An unexpected error occurred. Please try again.',
    'UNKNOWN_ERROR',
    500,
  );
};

export const isNetworkError = (error: unknown): boolean => {
  if (axios.isAxiosError(error)) {
    return !error.response && error.message === 'Network Error';
  }
  return false;
};

export const isServerError = (error: unknown): boolean => {
  const statusCode = getErrorStatusCode(error);
  return statusCode >= 500;
};

export const isClientError = (error: unknown): boolean => {
  const statusCode = getErrorStatusCode(error);
  return statusCode >= 400 && statusCode < 500;
};

export const isUnauthorized = (error: unknown): boolean => {
  return getErrorStatusCode(error) === 401;
};

export const isForbidden = (error: unknown): boolean => {
  return getErrorStatusCode(error) === 403;
};

export const logError = (
  error: unknown,
  context: string = 'Error',
  additionalInfo?: Record<string, unknown>
): void => {
  const timestamp = new Date().toISOString();
  const message = getErrorMessage(error);
  const diagnosticMessage = getDiagnosticMessageForLog(error);
  const code = getErrorCode(error);
  const statusCode = getErrorStatusCode(error);

  const errorLog = {
    timestamp,
    context,
    message,
    diagnosticMessage,
    code,
    statusCode,
    ...additionalInfo,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[Error Log]', errorLog);
  }

  // In production, you could send this to an error tracking service
  // Example: Sentry, LogRocket, etc.
  if (process.env.NEXT_PUBLIC_ERROR_TRACKING_URL) {
    try {
      navigator.sendBeacon(
        process.env.NEXT_PUBLIC_ERROR_TRACKING_URL,
        JSON.stringify(errorLog)
      );
    } catch (e) {
      console.error('Failed to send error log:', e);
    }
  }
};

export const createErrorResponse = (error: unknown, context?: string): ErrorResponse => {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);
  const statusCode = getErrorStatusCode(error);

  if (context) {
    logError(error, context);
  }

  return {
    message,
    code,
    statusCode,
  };
};
