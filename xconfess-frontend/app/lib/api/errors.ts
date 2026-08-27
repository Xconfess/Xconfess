/**
 * Normalized API error for UI consumption.
 * Use normalizeApiError() to turn fetch Response or Error into this shape.
 */
import {
  STATUS_ERROR_MESSAGES,
  STATUS_ERROR_CODES,
  toAppError,
} from '@/app/lib/utils/errorHandler';

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  retryAfter?: number | null;
  requestId?: string;
  timestamp?: string;
}

// Keep the local map as a stable override; share default map from errorHandler
const STATUS_MESSAGES = STATUS_ERROR_MESSAGES;
const STATUS_CODES = STATUS_ERROR_CODES;

/**
 * Normalizes a failed fetch Response or an Error into a consistent ApiError for UI.
 * For 429 responses, preserves retryAfter, requestId, and timestamp from the
 * normalized backend shape, falling back to response headers when body fields
 * are absent.
 */
export async function normalizeApiError(
  responseOrError: Response | Error
): Promise<ApiError> {
  if (responseOrError instanceof Response) {
    const status = responseOrError.status;
    let message = STATUS_MESSAGES[status];
    let retryAfter: number | null = null;
    let requestId: string | undefined;
    let timestamp: string | undefined;

    try {
      const body = await responseOrError.json();
      const raw = (body && (body.message ?? body.error ?? body.msg)) ?? null;
      if (typeof raw === 'string' && raw.length > 0) message = raw;

      if (status === 429) {
        // Prefer body fields from normalized backend shape
        if (typeof body.retryAfter === 'number') {
          retryAfter = body.retryAfter;
        } else {
          // Fall back to Retry-After header
          const headerVal = responseOrError.headers.get('retry-after');
          retryAfter = headerVal ? parseInt(headerVal, 10) : null;
        }

        requestId =
          body.requestId ??
          responseOrError.headers.get('x-request-id') ??
          responseOrError.headers.get('x-correlation-id') ??
          undefined;

        timestamp = body.timestamp ?? undefined;
      }
    } catch {
      // Body not JSON — fall back to headers
      if (status === 429) {
        const headerVal = responseOrError.headers.get('retry-after');
        retryAfter = headerVal ? parseInt(headerVal, 10) : null;
        requestId = responseOrError.headers.get('x-request-id') ?? undefined;
      }
    }

    return {
      message: message ?? 'An error occurred. Please try again.',
      code: STATUS_CODES[status] ?? 'REQUEST_FAILED',
      status,
      ...(status === 429 ? { retryAfter, requestId, timestamp } : {}),
    };
  }

  const err = responseOrError as Error;
  if (err instanceof TypeError) {
    return {
      message: err.message || 'Network error. Please check your connection and try again.',
      code: 'NETWORK_ERROR',
      status: 0,
      retryAfter: null,
    };
  }

  const appError = toAppError(err);
  return {
    message: appError.message,
    code: appError.code,
    status: appError.statusCode,
    retryAfter:
      typeof (appError.details as { retryAfter?: unknown } | undefined)?.retryAfter === 'number'
        ? (appError.details as { retryAfter: number }).retryAfter
        : null,
  };
}

/**
 * From an unknown catch value, returns a string message safe for UI display.
 */
export function getDisplayMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'Request was cancelled.';
    return error.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Returns true when a fetch Response is a rate-limit 429.
 */
export function isRateLimitResponse(res: Response): boolean {
  return res.status === 429;
}
