import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';

function makeHost(requestId?: string): ArgumentsHost {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status } as any;
  const request = {
    method: 'POST',
    url: '/stellar/verify',
    requestId,
  } as any;
  const ctx = {
    getResponse: () => response,
    getRequest: () => request,
  };
  return {
    switchToHttp: () => ctx,
  } as any;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('includes requestId from request object for unexpected errors', () => {
    const host = makeHost('req-id-123');
    const httpCtx = host.switchToHttp();
    const response = httpCtx.getResponse<any>();

    filter.catch(new Error('Unexpected DB failure'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.requestId).toBe('req-id-123');
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('falls back to "unknown" when no requestId on request', () => {
    const host = makeHost(undefined);
    const httpCtx = host.switchToHttp();
    const response = httpCtx.getResponse<any>();

    filter.catch(new Error('No requestId'), host);

    const body = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.requestId).toBe('unknown');
  });

  it('handles HttpException subclass by including requestId', () => {
    const host = makeHost('req-id-http');
    const httpCtx = host.switchToHttp();
    const response = httpCtx.getResponse<any>();

    filter.catch(
      new HttpException('Bad input', HttpStatus.BAD_REQUEST),
      host,
    );

    const body = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.requestId).toBe('req-id-http');
    expect(body.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('does not expose stack traces in the response body', () => {
    const host = makeHost('req-id-safe');
    const httpCtx = host.switchToHttp();
    const response = httpCtx.getResponse<any>();

    filter.catch(new Error('Secret internals'), host);

    const body = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body).not.toHaveProperty('stack');
    expect(body.message).toBe('An unexpected error occurred');
  });

  it('redacts a Stellar secret seed from the logged message and stack (#1472)', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const secret = 'S' + 'A'.repeat(55);
    const error = new Error(`Failed to sign transaction with secret ${secret}`);
    error.stack = `Error: leaked ${secret}\n    at somewhere`;

    const host = makeHost('req-id-secret');
    filter.catch(error, host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [loggedMessage, loggedStack] = errorSpy.mock.calls[0];
    expect(loggedMessage).not.toContain(secret);
    expect(loggedStack).not.toContain(secret);

    errorSpy.mockRestore();
  });

  it('redacts a long signed-XDR-shaped base64 blob from the logged message (#1472)', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const xdrLike = 'AAAAAgAAAAC'.repeat(20); // > 150 base64 chars
    const error = new Error(`Submission failed for envelope ${xdrLike}`);

    const host = makeHost('req-id-xdr');
    filter.catch(error, host);

    const [loggedMessage] = errorSpy.mock.calls[0];
    expect(loggedMessage).not.toContain(xdrLike);

    errorSpy.mockRestore();
  });
});
