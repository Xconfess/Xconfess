import { RequestIdMiddleware } from './request-id.middleware';
import type { NextFunction, Request, Response } from 'express';

describe('RequestIdMiddleware', () => {
  const run = (header?: string) => {
    const req = { headers: { 'x-request-id': header } } as unknown as Request & { requestId?: string };
    const setHeader = jest.fn();
    const next = jest.fn() as unknown as NextFunction;
    new RequestIdMiddleware().use(req, { setHeader } as unknown as Response, next);
    return { req, setHeader, next };
  };

  it('preserves a bounded printable client request ID', () => {
    const { req, setHeader, next } = run('client.trace-42');
    expect(req.requestId).toBe('client.trace-42');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'client.trace-42');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'bad\nid', 'x'.repeat(129), 'white space'])('replaces an unsafe request ID: %p', (header) => {
    const { req, setHeader } = run(header);
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
  });
});
