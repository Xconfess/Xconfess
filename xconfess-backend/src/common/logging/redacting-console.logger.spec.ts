import { REDACTION_FAILED, RedactingConsoleLogger } from './redacting-console.logger';
import * as redaction from './log-redaction';

/**
 * Representative logger tests (Issue #2282): real log shapes from services,
 * written through the logger `main.ts` installs as the app logger (every
 * `new Logger(...)` call delegates to it). jest.setup.ts silences Nest's
 * `Logger`, so the logger is called directly. Assertions run on the bytes
 * actually written to stdout/stderr.
 */
describe('RedactingConsoleLogger (application log privacy)', () => {
  const CONFESSION = 'I secretly cheated on my exam last week';
  const MESSAGE = 'meet me behind the library at 6';
  const JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  const STELLAR_SECRET = `S${'B'.repeat(55)}`;

  let output: string;
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    output = '';
    const capture = (chunk: unknown) => {
      output += String(chunk);
      return true;
    };
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture as any);
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture as any);
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
    jest.restoreAllMocks();
  });

  it('confession service: does not log confession content from a DTO', () => {
    const logger = new RedactingConsoleLogger('ConfessionService');
    logger.log({
      event: 'confession.created',
      confessionId: 'c-1',
      dto: { content: CONFESSION, gender: 'other' },
    });

    expect(output).toContain('confession.created');
    expect(output).toContain('c-1');
    expect(output).toContain('[REDACTED:user-content,len=39]');
    expect(output).not.toContain(CONFESSION);
  });

  it('messages service: does not log message body, even under an allowed "message" key', () => {
    const logger = new RedactingConsoleLogger('MessagesService');
    logger.warn({ message: { body: MESSAGE, recipientId: 'r-1' }, requestId: 'req-9' });

    expect(output).toContain('req-9');
    expect(output).not.toContain(MESSAGE);
  });

  it('comment service: redacts text inside arrays of entities', () => {
    const logger = new RedactingConsoleLogger('CommentService');
    logger.debug({ comments: [{ id: 1, text: CONFESSION }, { id: 2, content: MESSAGE }] });

    expect(output).not.toContain(CONFESSION);
    expect(output).not.toContain(MESSAGE);
  });

  it('auth: redacts bearer tokens and JWTs embedded in a free-text message', () => {
    const logger = new RedactingConsoleLogger('AuthGuard');
    logger.error(`Rejected header "Authorization: Bearer ${JWT}" for /api/messages`);

    expect(output).toContain('Bearer [REDACTED]');
    expect(output).toContain('/api/messages');
    expect(output).not.toContain(JWT);
  });

  it('auth: redacts token fields and token query parameters', () => {
    const logger = new RedactingConsoleLogger('PasswordResetService');
    logger.log({
      event: 'password.reset.requested',
      resetToken: 'reset-abc-123',
      url: '/reset?token=reset-abc-123&lang=en',
    });

    expect(output).toContain('lang=en');
    expect(output).not.toContain('reset-abc-123');
  });

  it('errors: redacts tokens in Error objects and in stack traces', () => {
    const logger = new RedactingConsoleLogger();
    const error = new Error(`upstream rejected ${JWT}`);
    logger.error(error, `Error: upstream rejected ${JWT}\n    at handler (auth.ts:10:5)`);

    expect(output).toContain('upstream rejected');
    expect(output).not.toContain(JWT);
  });

  it('stellar: still redacts secret-named fields', () => {
    const logger = new RedactingConsoleLogger('StellarService');
    logger.error({ event: 'stellar.sign.failed', serverSecret: STELLAR_SECRET });

    expect(output).toContain('stellar.sign.failed');
    expect(output).not.toContain(STELLAR_SECRET);
  });

  it('keeps allowed operational fields and the logger context readable', () => {
    const logger = new RedactingConsoleLogger('HttpRequests');
    logger.log({
      requestId: 'req-1',
      method: 'POST',
      route: '/api/confessions',
      statusCode: 201,
      durationMs: 12,
    });

    for (const expected of ['HttpRequests', 'req-1', 'POST', '/api/confessions', '201', '12']) {
      expect(output).toContain(expected);
    }
  });

  it('fails safe: logs a placeholder instead of the raw value if redaction throws', () => {
    jest.spyOn(redaction, 'redactLogMessage').mockImplementation(() => {
      throw new Error('boom');
    });
    const logger = new RedactingConsoleLogger('ConfessionService');
    logger.log({ content: CONFESSION });

    expect(output).toContain(REDACTION_FAILED);
    expect(output).not.toContain(CONFESSION);
  });

  it('handles circular payloads without throwing', () => {
    const payload: Record<string, unknown> = { event: 'loop' };
    payload.self = payload;
    const logger = new RedactingConsoleLogger('Loop');

    expect(() => logger.log(payload)).not.toThrow();
    expect(output).toContain('loop');
  });
});
