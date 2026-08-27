/**
 * Tests for app/lib/api/errors.ts
 * Covers normalizeApiError for 429 direct and proxy paths.
 */
import { normalizeApiError, isRateLimitResponse } from '../errors';

function makeResponse(
  status: number,
  body: object | null = null,
  headers: Record<string, string> = {},
): Response {
  return new Response(body !== null ? JSON.stringify(body) : '', {
    status,
    headers,
  });
}

const BACKEND_429_BODY = {
  statusCode: 429,
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many requests. Please wait a moment and try again.',
  retryAfter: 30,
  requestId: 'req-abc-123',
  timestamp: '2026-06-27T00:00:00.000Z',
  path: '/api/confessions',
};

describe('isRateLimitResponse', () => {
  it('returns true for 429', () => expect(isRateLimitResponse(makeResponse(429))).toBe(true));
  it('returns false for 200', () => expect(isRateLimitResponse(makeResponse(200))).toBe(false));
  it('returns false for 401', () => expect(isRateLimitResponse(makeResponse(401))).toBe(false));
});

describe('normalizeApiError — 429 from backend (direct)', () => {
  it('extracts retryAfter from body', async () => {
    const res = makeResponse(429, BACKEND_429_BODY);
    const err = await normalizeApiError(res);
    expect(err.retryAfter).toBe(30);
  });

  it('extracts requestId from body', async () => {
    const res = makeResponse(429, BACKEND_429_BODY);
    const err = await normalizeApiError(res);
    expect(err.requestId).toBe('req-abc-123');
  });

  it('extracts timestamp from body', async () => {
    const res = makeResponse(429, BACKEND_429_BODY);
    const err = await normalizeApiError(res);
    expect(err.timestamp).toBe('2026-06-27T00:00:00.000Z');
  });

  it('status is 429', async () => {
    const res = makeResponse(429, BACKEND_429_BODY);
    const err = await normalizeApiError(res);
    expect(err.status).toBe(429);
  });
});

describe('normalizeApiError — 429 fallback to headers', () => {
  it('falls back to Retry-After header when body retryAfter missing', async () => {
    const { retryAfter, ...bodyWithout } = BACKEND_429_BODY;
    const res = makeResponse(429, bodyWithout, { 'retry-after': '60' });
    const err = await normalizeApiError(res);
    expect(err.retryAfter).toBe(60);
  });

  it('falls back to x-request-id header when body requestId missing', async () => {
    const { requestId, ...bodyWithout } = BACKEND_429_BODY;
    const res = makeResponse(429, bodyWithout, { 'x-request-id': 'header-id' });
    const err = await normalizeApiError(res);
    expect(err.requestId).toBe('header-id');
  });

  it('handles non-JSON 429 body, falls back to headers', async () => {
    const res = new Response('rate limited', {
      status: 429,
      headers: { 'retry-after': '10', 'x-request-id': 'hdr-req-id' },
    });
    const err = await normalizeApiError(res);
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(10);
    expect(err.requestId).toBe('hdr-req-id');
  });

  it('retryAfter is null when no body field and no header', async () => {
    const { retryAfter, ...bodyWithout } = BACKEND_429_BODY;
    const res = makeResponse(429, bodyWithout);
    const err = await normalizeApiError(res);
    expect(err.retryAfter).toBeNull();
  });
});

describe('normalizeApiError — non-429 responses', () => {
  it('does not include retryAfter for 200', async () => {
    const res = makeResponse(200, { message: 'ok' });
    const err = await normalizeApiError(res);
    expect(err.retryAfter).toBeUndefined();
  });

  it('does not include retryAfter for 401', async () => {
    const res = makeResponse(401, { message: 'Unauthorized' });
    const err = await normalizeApiError(res);
    expect(err.retryAfter).toBeUndefined();
  });

  it('extracts message from body for 500', async () => {
    const res = makeResponse(500, { message: 'Internal error' });
    const err = await normalizeApiError(res);
    expect(err.message).toBe('Internal error');
  });

  it('uses normalized fallback status and code for backend validation errors', async () => {
    const res = makeResponse(422, { message: 'Display name is required' });
    const err = await normalizeApiError(res);
    expect(err).toMatchObject({
      status: 422,
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Display name is required',
    });
  });
});

describe('normalizeApiError — network errors', () => {
  it('normalizes thrown fetch errors into the shared ApiError shape', async () => {
    const err = await normalizeApiError(new TypeError('fetch failed'));
    expect(err).toMatchObject({
      message: 'fetch failed',
      code: 'NETWORK_ERROR',
    });
  });
});
