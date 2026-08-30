import { redactLogPayload, redactStringValue } from './log-redaction';

describe('Log Redaction', () => {
  describe('redactLogPayload', () => {
    it('redacts fields named "password"', () => {
      const input = { message: 'login', password: 'supersecret' };
      const result = redactLogPayload(input);
      expect(result.password).toBe('[REDACTED]');
      expect(result.message).toBe('login');
    });

    it('redacts fields named "token"', () => {
      const input = { message: 'auth', token: 'abc123xyz' };
      const result = redactLogPayload(input);
      expect(result.token).toBe('[REDACTED]');
    });

    it('redacts fields named "apiKey"', () => {
      const input = { message: 'config', apiKey: 'key-123' };
      const result = redactLogPayload(input);
      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('redacts fields named "secret"', () => {
      const input = { message: 'env', secret: 'topsecret' };
      const result = redactLogPayload(input);
      expect(result.secret).toBe('[REDACTED]');
    });

    it('redacts fields matching /token$/ pattern', () => {
      const input = { message: 'auth', resetToken: 'xyz', sessionToken: 'abc' };
      const result = redactLogPayload(input);
      expect(result.resetToken).toBe('[REDACTED]');
      expect(result.sessionToken).toBe('[REDACTED]');
    });

    it('preserves requestId in logs', () => {
      const input = { requestId: 'req-abc-123', message: 'test' };
      const result = redactLogPayload(input);
      expect(result.requestId).toBe('req-abc-123');
    });

    it('preserves timestamp in logs', () => {
      const input = { timestamp: '2026-08-30T12:00:00Z', message: 'test' };
      const result = redactLogPayload(input);
      expect(result.timestamp).toBe('2026-08-30T12:00:00Z');
    });

    it('preserves status code in logs', () => {
      const input = { status: 200, message: 'ok' };
      const result = redactLogPayload(input);
      expect(result.status).toBe(200);
    });

    it('preserves method and route in logs', () => {
      const input = { method: 'POST', route: '/api/confessions', message: 'created' };
      const result = redactLogPayload(input);
      expect(result.method).toBe('POST');
      expect(result.route).toBe('/api/confessions');
    });

    it('preserves userId and userRole in logs', () => {
      const input = { userId: 'user_abc123', userRole: 'admin', message: 'test' };
      const result = redactLogPayload(input);
      expect(result.userId).toBe('user_abc123');
      expect(result.userRole).toBe('admin');
    });

    it('redacts nested sensitive fields', () => {
      const input = {
        message: 'auth',
        details: {
          password: 'secret123',
          token: 'jwt-value',
          safe: 'visible',
        },
      };
      const result = redactLogPayload(input);
      expect(result.details.password).toBe('[REDACTED]');
      expect(result.details.token).toBe('[REDACTED]');
      expect(result.details.safe).toBe('visible');
    });

    it('redacts JWT-shaped values regardless of field name', () => {
      const input = {
        message: 'token',
        someField: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      };
      const result = redactLogPayload(input);
      expect(result.someField).toBe('[REDACTED]');
    });

    it('redacts long hex strings (>40 chars)', () => {
      const input = {
        message: 'key',
        hexKey: 'a'.repeat(64),
      };
      const result = redactLogPayload(input);
      expect(result.hexKey).toMatch(/^[a-f]{4}\.\.\.REDACTED$/);
    });

    it('does not redact short hex strings', () => {
      const input = {
        message: 'id',
        shortId: 'abc123',
      };
      const result = redactLogPayload(input);
      expect(result.shortId).toBe('abc123');
    });

    it('handles null and undefined values', () => {
      const input = {
        message: 'test',
        optional: null,
        missing: undefined,
      };
      const result = redactLogPayload(input);
      expect(result.optional).toBeNull();
      expect(result.missing).toBeUndefined();
    });

    it('handles arrays of objects', () => {
      const input = {
        message: 'list',
        items: [
          { name: 'safe', secret: 'hidden' },
          { name: 'also safe', token: 'gone' },
        ],
      };
      const result = redactLogPayload(input);
      expect(result.items[0].name).toBe('safe');
      expect(result.items[0].secret).toBe('[REDACTED]');
      expect(result.items[1].token).toBe('[REDACTED]');
    });

    it('does not mutate the original input', () => {
      const input = { password: 'original', message: 'test' };
      redactLogPayload(input);
      expect(input.password).toBe('original');
    });
  });

  describe('redactStringValue', () => {
    it('redacts JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123';
      expect(redactStringValue(jwt)).toBe('[REDACTED]');
    });

    it('redacts long hex strings', () => {
      const hex = 'a'.repeat(50);
      expect(redactStringValue(hex)).toMatch(/^[a-f]{4}\.\.\.REDACTED$/);
    });

    it('does not redact normal strings', () => {
      expect(redactStringValue('hello world')).toBe('hello world');
    });

    it('does not redact short strings', () => {
      expect(redactStringValue('abc')).toBe('abc');
    });
  });
});
