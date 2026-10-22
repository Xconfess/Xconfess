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

  it('preserves a validated UUID v4 request ID', () => {
    const requestId = 'd9428888-122b-4f3f-a8a1-17f1b2d39455';
    const { req, setHeader, next } = run(requestId);
    expect(req.requestId).toBe(requestId);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', 'bad\nid', 'x'.repeat(129), 'white space', 'client.trace-42'])('replaces an unsafe request ID: %p', (header) => {
    const { req, setHeader } = run(header);
    expect(req.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
  });
});
