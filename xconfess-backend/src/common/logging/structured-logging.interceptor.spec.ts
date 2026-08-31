import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { StructuredLoggingInterceptor } from './structured-logging.interceptor';

function makeExecutionContext(overrides: Partial<{
  method: string;
  url: string;
  requestId: string;
  user: any;
  ip: string;
  statusCode: number;
  getHeader: (name: string) => string | undefined;
}> = {}): ExecutionContext {
  const req = {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/api/health/live',
    requestId: overrides.requestId,
    user: overrides.user,
    ip: overrides.ip ?? '127.0.0.1',
    headers: {},
  };

  const res = {
    statusCode: overrides.statusCode ?? 200,
    getHeader: overrides.getHeader ?? (() => undefined),
    setHeader: jest.fn(),
  };

  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as any;
}

function makeCallHandler(responseBody: any = { ok: true }): CallHandler {
  return {
    handle: () => of(responseBody),
  };
}

function makeErrorCallHandler(error: Error): CallHandler {
  return {
    handle: () => throwError(() => error),
  };
}

describe('StructuredLoggingInterceptor', () => {
  let interceptor: StructuredLoggingInterceptor;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new StructuredLoggingInterceptor();
    logSpy = jest.spyOn<any, any>(
      (interceptor as any).logger,
      'log',
    ).mockImplementation(() => {});
    warnSpy = jest.spyOn<any, any>(
      (interceptor as any).logger,
      'warn',
    ).mockImplementation(() => {});
    errorSpy = jest.spyOn<any, any>(
      (interceptor as any).logger,
      'error',
    ).mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a 2xx request with structured fields', (done) => {
    const ctx = makeExecutionContext({
      requestId: 'req-abc-123',
      method: 'GET',
      url: '/api/health/live',
    });

    interceptor.intercept(ctx, makeCallHandler()).subscribe({
      next: () => {
        expect(logSpy).toHaveBeenCalledTimes(1);
        const logLine = logSpy.mock.calls[0][0];
        const parsed = JSON.parse(logLine);

        expect(parsed.method).toBe('GET');
        expect(parsed.route).toBe('/api/health/live');
        expect(parsed.status).toBe(200);
        expect(parsed.requestId).toBe('req-abc-123');
        expect(parsed.duration).toBeGreaterThanOrEqual(0);
        expect(parsed.userId).toBeDefined();
        expect(parsed.userRole).toBeDefined();
        expect(parsed.subsystem).toBe('health');
        expect(parsed.timestamp).toBeDefined();
        expect(parsed.ip).toBe('127.0.0.1');
        done();
      },
    });
  });

  it('warns on 4xx responses', (done) => {
    const ctx = makeExecutionContext({
      requestId: 'req-404',
      statusCode: 404,
      url: '/api/confessions/999',
    });

    interceptor.intercept(ctx, makeCallHandler()).subscribe({
      next: () => {
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const logLine = warnSpy.mock.calls[0][0];
        const parsed = JSON.parse(logLine);

        expect(parsed.status).toBe(404);
        expect(parsed.requestId).toBe('req-404');
        expect(parsed.subsystem).toBe('confession');
        done();
      },
    });
  });

  it('errors on 5xx responses', (done) => {
    const ctx = makeExecutionContext({
      requestId: 'req-500',
      statusCode: 500,
      url: '/api/stellar/verify',
    });

    interceptor.intercept(ctx, makeCallHandler()).subscribe({
      next: () => {
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const logLine = errorSpy.mock.calls[0][0];
        const parsed = JSON.parse(logLine);

        expect(parsed.status).toBe(500);
        expect(parsed.subsystem).toBe('stellar');
        done();
      },
    });
  });

  it('redacts sensitive fields from the log output', (done) => {
    const ctx = makeExecutionContext({
      requestId: 'req-safe',
      user: { id: 1, role: 'user' },
    });

    interceptor.intercept(ctx, makeCallHandler({ token: 'secret123' })).subscribe({
      next: () => {
        const logLine = logSpy.mock.calls[0][0];
        // The log line itself should not contain raw secrets
        expect(logLine).not.toContain('secret123');
        done();
      },
    });
  });

  it('includes userId from request.user when authenticated', (done) => {
    const ctx = makeExecutionContext({
      requestId: 'req-auth',
      user: { id: 42, role: 'admin' },
    });

    interceptor.intercept(ctx, makeCallHandler()).subscribe({
      next: () => {
        const parsed = JSON.parse(logSpy.mock.calls[0][0]);
        expect(parsed.userId).toBe('user_42');
        expect(parsed.userRole).toBe('admin');
        done();
      },
    });
  });

  it('shows anonymous for unauthenticated requests', (done) => {
    const ctx = makeExecutionContext({
      requestId: 'req-anon',
      user: undefined,
    });

    interceptor.intercept(ctx, makeCallHandler()).subscribe({
      next: () => {
        const parsed = JSON.parse(logSpy.mock.calls[0][0]);
        expect(parsed.userId).toBe('anonymous');
        expect(parsed.userRole).toBe('anonymous');
        done();
      },
    });
  });

  it('handles errors and logs errorClass and errorMessage', (done) => {
    const ctx = makeExecutionContext({
      requestId: 'req-err',
      statusCode: 500,
      url: '/api/auth/login',
    });

    const error = new TypeError('Cannot read property of undefined');
    interceptor.intercept(ctx, makeErrorCallHandler(error)).subscribe({
      error: () => {
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
        expect(parsed.errorClass).toBe('TypeError');
        expect(parsed.errorMessage).toBe('Cannot read property of undefined');
        expect(parsed.requestId).toBe('req-err');
        expect(parsed.subsystem).toBe('auth');
        done();
      },
    });
  });

  it('infers subsystem from route path', (done) => {
    const routes = [
      { url: '/api/comments/1', subsystem: 'comment' },
      { url: '/api/reactions/like', subsystem: 'reaction' },
      { url: '/api/messages/inbox', subsystem: 'message' },
      { url: '/api/admin/users', subsystem: 'admin' },
      { url: '/api/analytics/stats', subsystem: 'analytics' },
      { url: '/api/tipping/send', subsystem: 'tipping' },
      { url: '/api/report/123', subsystem: 'report' },
      { url: '/api/notifications', subsystem: 'notification' },
      { url: '/api/export/request', subsystem: 'export' },
      { url: '/api/bookmarks', subsystem: 'bookmark' },
      { url: '/api/search', subsystem: 'search' },
    ];

    let completed = 0;
    routes.forEach(({ url, subsystem }) => {
      const ctx = makeExecutionContext({ url, requestId: `req-${subsystem}` });
      interceptor.intercept(ctx, makeCallHandler()).subscribe({
        next: () => {
          const parsed = JSON.parse(logSpy.mock.calls[completed][0]);
          expect(parsed.subsystem).toBe(subsystem);
          completed++;
          if (completed === routes.length) done();
        },
      });
    });
  });
});
