import {
  ROUTE_CATEGORY_LABELS,
  categorizeRoute,
  normalizeMethod,
  statusClassOf,
} from './metric-labels';

describe('metric-labels', () => {
  describe('categorizeRoute', () => {
    it.each([
      ['GET', '/api/confessions', 'confessions_feed'],
      ['POST', '/api/confessions', 'confessions'],
      ['GET', '/api/confessions/search', 'confessions_search'],
      ['GET', '/api/confessions/search/fulltext', 'confessions_search'],
      ['GET', '/api/confessions/trending/top', 'confessions_trending'],
      ['GET', '/api/confessions/tags/:tag', 'confessions_tags'],
      ['GET', '/api/confessions/drafts', 'confessions_drafts'],
      ['GET', '/api/confessions/:id', 'confessions'],
      ['GET', '/api/confessions/:id/comments', 'confessions_comments'],
      ['POST', '/api/confessions/:id/tips', 'confessions_tips'],
      ['POST', '/api/auth/login', 'auth'],
      ['GET', '/api/health/live', 'health'],
      ['GET', '/api/metrics', 'metrics'],
      ['GET', '/api/admin/moderation/queue', 'admin'],
      ['GET', '/api/data-export/download', 'export'],
      ['GET', '/', 'root'],
      ['GET', '/api', 'root'],
    ])('%s %s -> %s', (method, path, expected) => {
      expect(categorizeRoute(method, path)).toBe(expected);
    });

    it('maps raw ids to the same category as the route template', () => {
      expect(
        categorizeRoute(
          'GET',
          '/api/confessions/3f2b8c1e-1111-4222-8333-444455556666',
        ),
      ).toBe(categorizeRoute('GET', '/api/confessions/:id'));
    });

    it('never returns anything outside the fixed category list', () => {
      const hostile = [
        '/api/users/alice@example.com',
        '/api/confessions/123456789',
        '/api/confessions/3f2b8c1e-1111-4222-8333-444455556666/comments',
        '/api/unknown-thing/abc',
        '/api/constructor',
        '/api/__proto__',
        '/api/confessions/__proto__',
        '/random?token=secret&user=42',
        '',
        undefined,
        null,
        42,
      ];
      for (const path of hostile) {
        expect(ROUTE_CATEGORY_LABELS).toContain(categorizeRoute('GET', path));
      }
    });

    it('ignores query strings and fragments', () => {
      expect(
        categorizeRoute('GET', '/api/confessions?cursor=abc&user=42'),
      ).toBe('confessions_feed');
      expect(categorizeRoute('GET', '/api/unknown?email=a@b.c')).toBe('other');
    });

    it('does not treat prototype keys as categories', () => {
      expect(categorizeRoute('GET', '/api/constructor')).toBe('other');
      expect(categorizeRoute('GET', '/api/toString')).toBe('other');
    });
  });

  describe('normalizeMethod', () => {
    it('upper-cases known methods and collapses unknown ones', () => {
      expect(normalizeMethod('get')).toBe('GET');
      expect(normalizeMethod('PROPFIND')).toBe('OTHER');
      expect(normalizeMethod(undefined)).toBe('OTHER');
    });
  });

  describe('statusClassOf', () => {
    it('groups status codes into classes', () => {
      expect(statusClassOf(200)).toBe('2xx');
      expect(statusClassOf(304)).toBe('3xx');
      expect(statusClassOf(404)).toBe('4xx');
      expect(statusClassOf(503)).toBe('5xx');
      expect(statusClassOf(999)).toBe('other');
      expect(statusClassOf('200')).toBe('other');
      expect(statusClassOf(NaN)).toBe('other');
    });
  });
});
