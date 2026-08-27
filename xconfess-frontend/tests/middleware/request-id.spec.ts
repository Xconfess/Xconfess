import { getOrCreateRequestId, withRequestId, requestIdResponseHeaders } from '@/app/lib/utils/requestId';

describe('Request ID Propagation', () => {
  describe('getOrCreateRequestId', () => {
    it('generates a UUID when no header is present', () => {
      const request = new Request('http://localhost/api/test');
      const id = getOrCreateRequestId(request);
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('uses X-Request-ID header when present', () => {
      const request = new Request('http://localhost/api/test', {
        headers: { 'X-Request-ID': 'abc-123' },
      });
      expect(getOrCreateRequestId(request)).toBe('abc-123');
    });

    it('uses x-request-id header (lowercase) when present', () => {
      const request = new Request('http://localhost/api/test', {
        headers: { 'x-request-id': 'lower-456' },
      });
      expect(getOrCreateRequestId(request)).toBe('lower-456');
    });

    it('falls back to X-Correlation-ID for backward compatibility', () => {
      const request = new Request('http://localhost/api/test', {
        headers: { 'X-Correlation-ID': 'corr-789' },
      });
      expect(getOrCreateRequestId(request)).toBe('corr-789');
    });

    it('trims whitespace from header values', () => {
      const request = new Request('http://localhost/api/test', {
        headers: { 'X-Request-ID': '  spaced-id  ' },
      });
      expect(getOrCreateRequestId(request)).toBe('spaced-id');
    });

    it('generates a new ID for empty header values', () => {
      const request = new Request('http://localhost/api/test', {
        headers: { 'X-Request-ID': '   ' },
      });
      const id = getOrCreateRequestId(request);
      expect(id).not.toBe('');
      expect(id.trim().length).toBeGreaterThan(0);
    });
  });

  describe('withRequestId', () => {
    it('adds x-request-id to headers', () => {
      const headers = withRequestId({ 'Content-Type': 'application/json' }, 'test-id');
      expect(headers['x-request-id']).toBe('test-id');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('requestIdResponseHeaders', () => {
    it('returns headers with x-request-id', () => {
      const headers = requestIdResponseHeaders('resp-id');
      expect(headers['x-request-id']).toBe('resp-id');
    });
  });
});
