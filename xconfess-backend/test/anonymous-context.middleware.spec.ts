import { AnonymousContextMiddleware } from '../src/middleware/anonymous-context.middleware';
import { AnonymousUserService } from '../src/user/anonymous-user.service';

describe('AnonymousContextMiddleware', () => {
  function makeMockService(userId = 'abc-123'): AnonymousUserService {
    return {
      getOrCreateForUserSession: jest.fn().mockResolvedValue({ id: userId }),
    } as unknown as AnonymousUserService;
  }

  it('adds x-anonymous-context-id when req.user exists', async () => {
    const mockService = makeMockService();
    const mw = new AnonymousContextMiddleware(mockService);
    const req: any = { user: { id: 1 }, headers: {} };
    const setHeader = jest.fn();
    const res: any = { setHeader };
    const next = jest.fn();

    await mw.use(req, res, next);

    expect(setHeader).toHaveBeenCalledWith(
      'x-anonymous-context-id',
      expect.stringMatching(/^anon_[a-f0-9-]+$/),
    );
    expect(req['anonymousContextId']).toMatch(/^anon_[a-f0-9-]+$/);
    expect(next).toHaveBeenCalled();
  });

  it('does not add header when unauthenticated', async () => {
    const mockService = makeMockService();
    const mw = new AnonymousContextMiddleware(mockService);
    const req: any = { headers: {} };
    const setHeader = jest.fn();
    const res: any = { setHeader };
    const next = jest.fn();

    await mw.use(req, res, next);

    expect(setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
