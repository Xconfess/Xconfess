import { SanitizationMiddleware } from '../src/middleware/sanitization.middleware';
import { MALICIOUS_PAYLOAD_FIXTURES } from '../../shared/fixtures/malicious-payloads';
import { encryptConfession, decryptConfession } from '../src/utils/confession-encryption';

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

  // ── Shared Malicious Fixtures Testing ─────────────────────────────────────

  describe('Shared Malicious Payload Fixtures', () => {
    it.each(MALICIOUS_PAYLOAD_FIXTURES)(
      'sanitizes $id ($description) in confession context',
      async (fixture) => {
        const req = makeReq({ message: fixture.input }, {}, '/api/confessions');
        await run(mw, req);

        for (const notAllowed of fixture.expectedSanitizedConfessionNotContains) {
          expect(req.body.message).not.toContain(notAllowed);
        }
        if (fixture.expectedSanitizedConfessionContains) {
          expect(req.body.message).toContain(fixture.expectedSanitizedConfessionContains);
        }
      },
    );

    it.each(MALICIOUS_PAYLOAD_FIXTURES)(
      'sanitizes $id ($description) in comment context',
      async (fixture) => {
        const req = makeReq({ content: fixture.input }, {}, '/api/comments');
        await run(mw, req);

        for (const notAllowed of fixture.expectedSanitizedPlainTextNotContains) {
          expect(req.body.content).not.toContain(notAllowed);
        }
      },
    );
  });

  // ── Confession context ─────────────────────────────────────────────────────

  describe('confession context', () => {
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

    it('preserves allowed markdown HTML tags and attributes', async () => {
      const req = makeReq(
        {
          message:
            '# Title\n' +
            'I feel <strong>strongly</strong> about <em>this</em>. ' +
            '<a href="https://example.com" target="_blank">Link</a>',
        },
        {},
        '/api/confessions',
      );
      await run(mw, req);
      expect(req.body.message).toContain('<strong>strongly</strong>');
      expect(req.body.message).toContain('<em>this</em>');
      expect(req.body.message).toContain('<a href="https://example.com" target="_blank">Link</a>');
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

  // ── Messages context ────────────────────────────────────────────────────────

  describe('messages context', () => {
    it('applies markdown sanitization policy to messages route', async () => {
      const req = makeReq(
        { body: 'Direct message with <script>alert(1)</script> <strong>safe markdown</strong>' },
        {},
        '/api/messages',
      );
      await run(mw, req);
      expect(req.body.body).not.toContain('<script>');
      expect(req.body.body).toContain('<strong>safe markdown</strong>');
    });
  });

  // ── Comment & Reports context ─────────────────────────────────────────────

  describe('comment & reports context', () => {
    it('strips all HTML tags from comments', async () => {
      const req = makeReq(
        { content: 'Nice <b>post</b>! <script>evil()</script>' },
        {},
        '/api/comments',
      );
      await run(mw, req);
      expect(req.body.content).toBe('Nice post!');
      expect(req.body.content).not.toContain('<b>');
    });

    it('strips all HTML tags from reports', async () => {
      const req = makeReq(
        { reason: 'Abusive content <i>here</i> <script>alert(1)</script>' },
        {},
        '/api/reports',
      );
      await run(mw, req);
      expect(req.body.reason).toBe('Abusive content here');
      expect(req.body.reason).not.toContain('<i>');
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
      const req = makeReq({}, { q: 'user_name' }, '/api/search');
      await run(mw, req);
      expect(req.query['q']).toBe('user\\_name');
    });
  });

  // ── Encryption Flow Preservation ──────────────────────────────────────────

  describe('Encryption Flow Integration', () => {
    const key = '12345678901234567890123456789012';

    it('sanitizes input before encryption while preserving safe content', async () => {
      const input = 'Secret confession <script>alert(1)</script> <strong>bold text</strong>';
      const req = makeReq({ message: input }, {}, '/api/confessions');
      await run(mw, req);

      const sanitized = req.body.message;
      expect(sanitized).toBe('Secret confession  <strong>bold text</strong>');

      const encrypted = encryptConfession(sanitized, key);
      expect(encrypted).not.toBe(sanitized);

      const decrypted = decryptConfession(encrypted, key);
      expect(decrypted).toBe('Secret confession  <strong>bold text</strong>');
    });
  });

  // ── Nested objects and edge cases ─────────────────────────────────────────

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
        { tags: ['valid', '<b onclick="xss()">bad</b>'] },
        {},
        '/api/confessions',
      );
      await run(mw, req);
      const tags = req.body.tags as string[];
      expect(tags[0]).toBe('valid');
      expect(tags[1]).not.toContain('onclick');
      expect(tags[1]).toContain('<b>bad</b>');
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
