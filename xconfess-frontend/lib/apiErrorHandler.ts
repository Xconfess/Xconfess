/**
 * Centralized API error formatting and normalization.
 * Standardizes error responses across all App Router proxy handlers.
 *
 * For 429 responses, the normalized shape is:
 *   { statusCode, code, message, retryAfter, requestId, timestamp }
 * and Retry-After / X-Request-Id headers are forwarded to the client.
 */

export interface ApiErrorResponse {
  message: string;
  status: number;
  correlationId?: string;
  details?: Record<string, unknown>;
  // Rate-limit specific fields
  code?: string;
  retryAfter?: number | null;
  requestId?: string;
  timestamp?: string;
}

/**
 * Normalizes backend and proxy errors into a consistent JSON shape.
 */
export function normalizeApiError(
  error: any,
  context: {
    correlationId?: string;
    status?: number;
    fallbackMessage?: string;
  } = {}
): ApiErrorResponse {
  const status = error?.statusCode || error?.status || error?.backendStatus || context.status || 500;
  const correlationId =
    error?.correlationId ||
    (context.correlationId !== 'unknown' ? context.correlationId : undefined);

  let message = context.fallbackMessage || 'An unexpected error occurred';

  if (typeof error === 'string') {
    message = error;
  } else if (error?.message) {
    message = error.message;
  } else if (error?.error) {
    message = typeof error.error === 'string' ? error.error : (error.error.message || message);
  }

  const base: ApiErrorResponse = {
    message,
    status,
    correlationId,
    code: error?.code,
    details: error?.details,
  };

  // Preserve rate-limit metadata when the backend sends the normalized 429 shape
  if (status === 429) {
    base.code = error?.code ?? 'RATE_LIMIT_EXCEEDED';
    base.retryAfter = typeof error?.retryAfter === 'number' ? error.retryAfter : null;
    base.requestId = error?.requestId ?? correlationId;
    base.timestamp = error?.timestamp ?? new Date().toISOString();
  }

  return base;
}

/**
 * Creates a standard JSON Response for API errors.
 * For 429 responses, forwards Retry-After and X-Request-Id headers.
 */
export function createApiErrorResponse(
  error: any,
  context: {
    correlationId?: string;
    status?: number;
    fallbackMessage?: string;
    route?: string;
    // Pass the upstream Response to forward its rate-limit headers
    upstreamResponse?: Response;
  } = {}
): Response {
  const normalized = normalizeApiError(error, context);

  if (context.route && process.env.NODE_ENV === 'development' && normalized.status >= 500) {
    console.debug(`[${context.route}] Error response generated`);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Forward rate-limit headers from the upstream backend response
  if (normalized.status === 429) {
    const upstream = context.upstreamResponse;
    const retryAfter =
      normalized.retryAfter ??
      (upstream ? parseInt(upstream.headers.get('retry-after') ?? '60', 10) : 60);

    headers['Retry-After'] = String(retryAfter);

    const reqId =
      normalized.requestId ??
      upstream?.headers.get('x-request-id') ??
      context.correlationId;

    if (reqId) headers['X-Request-Id'] = reqId;

    // Ensure normalized body has retryAfter for client consumption
    normalized.retryAfter = retryAfter;
  }

  return new Response(JSON.stringify(normalized), {
    status: normalized.status,
    headers,
  });
}
