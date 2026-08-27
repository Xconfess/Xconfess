import { randomUUID } from 'crypto';

const REQUEST_ID_HEADER =
  process.env.REQUEST_ID_HEADER_NAME || 'X-Request-ID';

export function getOrCreateRequestId(request: Request): string {
  const existing = request.headers.get(REQUEST_ID_HEADER)
    || request.headers.get('X-Correlation-ID')
    || request.headers.get('x-request-id');

  if (existing && existing.trim().length > 0) {
    return existing.trim();
  }

  return randomUUID();
}

export function requestIdHeader(): string {
  return REQUEST_ID_HEADER;
}

export function withRequestId(
  headers: Record<string, string>,
  requestId: string,
): Record<string, string> {
  return {
    ...headers,
    'x-request-id': requestId,
  };
}

export function requestIdResponseHeaders(requestId: string): Record<string, string> {
  return {
    'x-request-id': requestId,
  };
}
