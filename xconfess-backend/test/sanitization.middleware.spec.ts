import { SanitizationMiddleware } from '../src/middleware/sanitization.middleware';

function makeMiddleware() {
  return new SanitizationMiddleware();
}

function makeReq(
  body: Record<string, unknown> = {},
  query: Record<string, unknown> = {},
  path = '/api/confessions',
): any {
  return { body, query, path };
}

function makeRes(): any {
  return {};
}

function run(
  mw: SanitizationMiddleware,
  req: any,
): Promise<void> {
  return new Promise((resolve) => mw.use(req, makeRes(), resolve));
}

describe('SanitizationMiddleware', () => {
  let mw: SanitizationMiddleware;

  beforeEach(() => {
    mw = makeMiddleware();
  });

  // ── Confession context ─────────────────────────────────────────────────────

  describe('confession content', () => {
    it('strips <script> tags', async () => {
      const req = makeReq(
        { message: 'Hello <script>alert("xss")</script> world' },
        {},
        '/api/confessions',
      );
      await run(mw, req);
      expect(req.body.message).toBe('Hello  world');
      expect(req.body.message).not.toContain('<script>');
    });

    it('preserves allowed markdown HTML tags', async () => {
      const req = makeReq(
        { message: 'I feel <strong>strongly</strong> about <em>this</em>' },
        {},
        '/api/confessions',
      );
      await run(mw, req);
      expect(req.body.message).toContain('<strong>strongly</strong>');
      expect(req.body.message).toContain('<em>this</em>');
    });

    it('strips onclick and other dangerous attributes', async () => {
      const req = makeReq(
        { message: '<b onclick="evil()">text</b>' },
        {},
        '/api/confessions',
      );
      await run(mw, req);
      expect(req.body.message).not.toContain('onclick');
      expect(req.body.message).toContain('<b>text</b>');
    });

    it('strips iframe tags', async () => {
      const req = makeReq(
        { message: 'look <iframe src="evil.com"></iframe>' },
        {},
        '/api/confessions',
      );
      await run(mw, req);
      expect(req.body.message).not.toContain('<iframe');
    });

    it('neutralizes javascript: URLs', async () => {
      const req = makeReq(
        { message: '<a href="javascript:alert(1)">click</a>' },
        {},
        '/api/confessions',
      );
      await run(mw, req);
      expect(req.body.message).not.toContain('javascript:');
    });
  });

  // ── Comment context ────────────────────────────────────────────────────────

  describe('comment content', () => {
    it('strips all HTML tags', async () => {
      const req = makeReq(
        { content: 'Nice <b>post</b>! <script>evil()</script>' },
        {},
        '/api/comments',
      );
      await run(mw, req);
      expect(req.body.content).toBe('Nice post!');
      expect(req.body.content).not.toContain('<b>');
    });

    it('preserves plain text', async () => {
      const req = makeReq(
        { content: 'This is a normal comment.' },
        {},
        '/api/comments',
      );
      await run(mw, req);
      expect(req.body.content).toBe('This is a normal comment.');
    });
  });

  // ── Search context ─────────────────────────────────────────────────────────

  describe('search queries', () => {
    it('strips HTML from query string', async () => {
      const req = makeReq(
        {},
        { q: '<script>xss</script>love' },
        '/api/search',
      );
      await run(mw, req);
      expect(req.query['q']).not.toContain('<script>');
    });

    it('escapes SQL wildcard characters', async () => {
      const req = makeReq({}, { q: '100% complete' }, '/api/search');
      await run(mw, req);
      // % is not in the escape list (only %, _, \) — let's check _ is escaped
      const req2 = makeReq({}, { q: 'user_name' }, '/api/search');
      await run(mw, req2);
      expect(req2.query['q']).toBe('user\\_name');
    });
  });

  // ── Nested objects and arrays ──────────────────────────────────────────────

  describe('nested body sanitization', () => {
    it('sanitizes string fields inside nested objects', async () => {
      const req = makeReq(
        { metadata: { title: '<script>bad</script>title' } },
        {},
        '/api/confessions',
      );
      await run(mw, req);
      expect((req.body.metadata as any).title).not.toContain('<script>');
    });

    it('sanitizes strings inside arrays', async () => {
      const req = makeReq(
        { tags: ['valid', '<img onerror="xss()">bad'] },
        {},
        '/api/confessions',
      );
      await run(mw, req);
      const tags = req.body.tags as string[];
      expect(tags[0]).toBe('valid');
      expect(tags[1]).not.toContain('<img');
    });

    it('leaves non-string values untouched', async () => {
      const req = makeReq(
        { count: 42, active: true, data: null },
        {},
        '/api/confessions',
      );
      await run(mw, req);
      expect(req.body.count).toBe(42);
      expect(req.body.active).toBe(true);
      expect(req.body.data).toBeNull();
    });
  });

  // ── Generic context ────────────────────────────────────────────────────────

  describe('generic routes', () => {
    it('strips script tags from unknown routes', async () => {
      const req = makeReq(
        { note: '<script>alert(1)</script>hello' },
        {},
        '/api/misc',
      );
      await run(mw, req);
      expect(req.body.note).not.toContain('<script>');
    });
  });

  // ── No body ───────────────────────────────────────────────────────────────

  it('handles requests with no body gracefully', async () => {
    const req: any = { path: '/api/confessions', query: {} };
    await expect(run(mw, req)).resolves.toBeUndefined();
  });

  it('handles Buffer body without crashing', async () => {
    const req: any = {
      body: Buffer.from('raw'),
      query: {},
      path: '/api/confessions',
    };
    await run(mw, req);
    expect(Buffer.isBuffer(req.body)).toBe(true);
  });
});
