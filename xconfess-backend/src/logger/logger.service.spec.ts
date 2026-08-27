import { AppLogger } from './logger.service';

describe('AppLogger', () => {
  let service: AppLogger;

  beforeEach(() => {
    service = new AppLogger();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should mask user ids inside object payloads', () => {
    const payload = { userId: '1234567890abcdef', action: 'test' };
    const sanitized = (service as any).sanitize(payload);

    expect(sanitized).toEqual(
      expect.objectContaining({
        userId: expect.any(String),
        action: 'test',
      }),
    );
    expect(sanitized.userId).not.toBe(payload.userId);
  });

  it('redacts a Stellar secret seed embedded in a string message (#1472)', () => {
    const secret = 'S' + 'B'.repeat(55);
    const sanitized = (service as any).sanitize(`signing failed: ${secret}`);

    expect(sanitized).not.toContain(secret);
  });

  it('fully redacts fields whose key name indicates a secret, regardless of nesting (#1472)', () => {
    const payload = {
      event: 'stellar_error',
      details: { serverSecret: 'SCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' },
    };
    const sanitized = (service as any).sanitize(payload);

    expect(sanitized.details.serverSecret).toBe('[REDACTED]');
  });
});
