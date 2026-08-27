import { ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ThrottlerExceptionFilter, RateLimitErrorBody } from './throttler-exception.filter';
import { ErrorCode } from '../errors/error-codes';

function makeHost(
  reqOverrides: object = {},
  throttlerResponseData: object = {},
): ArgumentsHost {
  const req = {
    method: 'POST',
    url: '/api/confessions',
    ip: '127.0.0.1',
    requestId: 'test-req-id',
    headers: {},
    ...reqOverrides,
  };

  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnThis();
  const setHeaderMock = jest.fn().mockReturnThis();

  const res = { status: statusMock, setHeader: setHeaderMock, json: jsonMock };

  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
}

function makeException(retryAfter?: number): ThrottlerException {
  const ex = new ThrottlerException();
  jest.spyOn(ex, 'getResponse').mockReturnValue(
    retryAfter !== undefined ? { retryAfter } : 'Too Many Requests',
  );
  jest.spyOn(ex, 'getStatus').mockReturnValue(429);
  return ex;
}

describe('ThrottlerExceptionFilter', () => {
  let filter: ThrottlerExceptionFilter;

  beforeEach(() => {
    filter = new ThrottlerExceptionFilter();
  });

  it('responds with status 429', () => {
    const host = makeHost();
    const res = host.switchToHttp().getResponse() as any;
    filter.catch(makeException(30), host);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('response body has statusCode 429 (not status)', () => {
    const host = makeHost();
    const res = host.switchToHttp().getResponse() as any;
    filter.catch(makeException(30), host);
    const body: RateLimitErrorBody = res.json.mock.calls[0][0];
    expect(body.statusCode).toBe(429);
    expect((body as any).status).toBeUndefined();
  });

  it('response body code is RATE_LIMIT_EXCEEDED', () => {
    const host = makeHost();
    const res = host.switchToHttp().getResponse() as any;
    filter.catch(makeException(), host);
    const body: RateLimitErrorBody = res.json.mock.calls[0][0];
    expect(body.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
  });

  it('includes retryAfter from ThrottlerException response data', () => {
    const host = makeHost();
    const res = host.switchToHttp().getResponse() as any;
    filter.catch(makeException(45), host);
    const body: RateLimitErrorBody = res.json.mock.calls[0][0];
    expect(body.retryAfter).toBe(45);
  });

  it('falls back to retryAfter=60 when not in exception data', () => {
    const host = makeHost();
    const res = host.switchToHttp().getResponse() as any;
    filter.catch(makeException(), host);
    const body: RateLimitErrorBody = res.json.mock.calls[0][0];
    expect(body.retryAfter).toBe(60);
  });

  it('includes requestId from request object', () => {
    const host = makeHost({ requestId: 'my-trace-id' });
    const res = host.switchToHttp().getResponse() as any;
    filter.catch(makeException(), host);
    const body: RateLimitErrorBody = res.json.mock.calls[0][0];
    expect(body.requestId).toBe('my-trace-id');
  });

  it('sets Retry-After response header', () => {
    const host = makeHost();
    const res = host.switchToHttp().getResponse() as any;
    filter.catch(makeException(30), host);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '30');
  });

  it('sets X-Request-Id response header', () => {
    const host = makeHost({ requestId: 'my-req-id' });
    const res = host.switchToHttp().getResponse() as any;
    filter.catch(makeException(), host);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'my-req-id');
  });

  it('response body includes timestamp and path', () => {
    const host = makeHost();
    const res = host.switchToHttp().getResponse() as any;
    filter.catch(makeException(), host);
    const body: RateLimitErrorBody = res.json.mock.calls[0][0];
    expect(body.timestamp).toBeTruthy();
    expect(body.path).toBe('/api/confessions');
  });
});
