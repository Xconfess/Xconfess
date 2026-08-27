import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const csrfProtection = csurf({ cookie: { key: '_csrf', httpOnly: true, sameSite: 'strict' }, value: (req: any) => req.headers['x-xsrf-token'] || req.headers['x-csrf-token'] || (req.body && req.body._csrf) });
  app.use((req, res, next) => { if (req.path.startsWith('/api/webhooks/moderation')) return next(); csrfProtection(req as any, res as any, (err: any) => { if (err) return next(err); res.cookie('XSRF-TOKEN', (req as any).csrfToken(), { httpOnly: false }); next(); }); });
  app.get('/api/csrf-token', (_req: Request, res: Response) => { res.json({ ok: true }); });
  app.post('/api/confessions', (_req: Request, res: Response) => { res.status(201).json({ created: true }); });
  app.post('/api/webhooks/moderation/results', (_req: Request, res: Response) => { res.status(200).json({ ok: true }); });
  app.post('/api/webhooks/other-endpoint', (_req: Request, res: Response) => { res.status(200).json({ ok: true }); });
  app.post('/api/webhooks/moderation/../../dangerous-action', (_req: Request, res: Response) => { res.status(200).json({ ok: true }); });
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => { if (err.code === 'EBADCSRFTOKEN') { return res.status(403).json({ message: 'Invalid or missing CSRF token' }); } _next(err); });
  return app;
}

async function getValidToken(agent: ReturnType<typeof request.agent>) {
  const res = await agent.get('/api/csrf-token');
  const setCookie: string[] = res.headers['set-cookie'] ?? [];
  const tokenCookie = setCookie.find((c: string) => c.startsWith('XSRF-TOKEN=')) ?? '';
  const token = decodeURIComponent(tokenCookie.split(';')[0].split('=')[1] ?? '');
  return token;
}

describe('CSRF protection', () => {
  let app: express.Express;
  beforeAll(() => { app = buildTestApp(); });

  it('rejects POST with no CSRF token (403)', async () => {
    const res = await request(app).post('/api/confessions').send({ message: 'hello' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/csrf/i);
  });

  it('rejects POST with an invalid CSRF token (403)', async () => {
    const agent = request.agent(app);
    await agent.get('/api/csrf-token');
    const res = await agent.post('/api/confessions').set('X-XSRF-TOKEN', 'wrong-token').send({ message: 'hello' });
    expect(res.status).toBe(403);
  });

  it('accepts POST with a valid CSRF token (201)', async () => {
    const agent = request.agent(app);
    const token = await getValidToken(agent);
    const res = await agent.post('/api/confessions').set('X-XSRF-TOKEN', token).send({ message: 'hello' });
    expect(res.status).toBe(201);
  });

  it('webhook endpoint is exempt from CSRF checks (200)', async () => {
    const res = await request(app).post('/api/webhooks/moderation/results').send({ confessionId: 'abc', moderationScore: 0.1, moderationFlags: [], moderationStatus: 'APPROVED', details: {}, timestamp: new Date().toISOString() });
    expect(res.status).toBe(200);
  });

  it('rejects near-miss webhook path that is not explicitly listed (403)', async () => {
    const res = await request(app).post('/api/webhooks/other-endpoint').send({ data: 'test' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/csrf/i);
  });

  it('rejects path traversal disguised under webhooks prefix (403)', async () => {
    const res = await request(app).post('/api/webhooks/moderation/../../dangerous-action').send({ data: 'test' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/csrf/i);
  });
});
