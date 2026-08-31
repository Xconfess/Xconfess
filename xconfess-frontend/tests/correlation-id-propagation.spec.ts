/**
 * Correlation ID Propagation Test
 *
 * Verifies that a failed frontend API request can be traced to the backend
 * log by correlation ID. This test exercises the real GET /api/confessions
 * route handler, not a helper in isolation.
 */

import { GET } from '../app/api/confessions/route';

const mockFetch = jest.fn();

describe('Correlation ID Propagation (GET /api/confessions)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates a correlation ID and forwards it to the backend', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ data: [], total: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const request = new Request('http://localhost/api/confessions?page=1&limit=5');

    const response = await GET(request);

    // The route handler should have called fetch with an x-request-id header
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, fetchOptions] = mockFetch.mock.calls[0];
    expect(fetchOptions.headers['x-request-id']).toBeDefined();
    expect(fetchOptions.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // The response should echo the correlation ID in its headers
    const responseRequestId = response.headers.get('x-request-id');
    expect(responseRequestId).toBeDefined();
    expect(responseRequestId).toBe(fetchOptions.headers['x-request-id']);
  });

  it('uses client-provided X-Request-ID header when present', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ data: [], total: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const request = new Request('http://localhost/api/confessions', {
      headers: { 'X-Request-ID': 'client-correlation-id-123' },
    });

    const response = await GET(request);

    const [, fetchOptions] = mockFetch.mock.calls[0];
    expect(fetchOptions.headers['x-request-id']).toBe('client-correlation-id-123');

    const responseRequestId = response.headers.get('x-request-id');
    expect(responseRequestId).toBe('client-correlation-id-123');
  });

  it('uses X-Correlation-ID header for backward compatibility', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ data: [], total: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const request = new Request('http://localhost/api/confessions', {
      headers: { 'X-Correlation-ID': 'legacy-corr-456' },
    });

    const response = await GET(request);

    const [, fetchOptions] = mockFetch.mock.calls[0];
    expect(fetchOptions.headers['x-request-id']).toBe('legacy-corr-456');

    const responseRequestId = response.headers.get('x-request-id');
    expect(responseRequestId).toBe('legacy-corr-456');
  });

  it('propagates correlation ID through error responses (503)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const request = new Request('http://localhost/api/confessions', {
      headers: { 'X-Request-ID': 'error-trace-id-789' },
    });

    const response = await GET(request);

    expect(response.status).toBe(503);

    const body = await response.json();
    // The correlation ID should be present in the error body for tracing
    // (either as correlationId or in the requestId field)
    expect(body.correlationId).toBe('error-trace-id-789');
  });

  it('propagates correlation ID through upstream HTTP errors', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ message: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const request = new Request('http://localhost/api/confessions', {
      headers: { 'X-Request-ID': 'upstream-err-012' },
    });

    const response = await GET(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.correlationId).toBe('upstream-err-012');
  });
});
