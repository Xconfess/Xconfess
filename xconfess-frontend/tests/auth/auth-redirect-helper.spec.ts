/**
 * Unit coverage for the auth redirect helper's unsafe-path handling.
 *
 * isSafeAuthRedirect guards the `next` query param used for post-login
 * redirects. It must reject anything that isn't a same-origin, root-relative
 * path, since accepting protocol-relative or absolute URLs would allow an
 * open redirect (e.g. /login?next=https://evil.com).
 */
import { isSafeAuthRedirect } from '@/app/lib/utils/auth-redirect';

describe('isSafeAuthRedirect', () => {
  it('rejects null', () => {
    expect(isSafeAuthRedirect(null)).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isSafeAuthRedirect('')).toBe(false);
  });

  it('rejects a protocol-relative URL (open redirect vector)', () => {
    expect(isSafeAuthRedirect('//evil.com')).toBe(false);
  });

  it('rejects an absolute external URL', () => {
    expect(isSafeAuthRedirect('https://evil.com/phish')).toBe(false);
  });

  it('rejects a path missing the leading slash', () => {
    expect(isSafeAuthRedirect('dashboard')).toBe(false);
  });

  it('rejects a javascript: pseudo-protocol payload', () => {
    expect(isSafeAuthRedirect('javascript:alert(1)')).toBe(false);
  });

  it('accepts a safe root-relative path', () => {
    expect(isSafeAuthRedirect('/dashboard')).toBe(true);
  });

  it('accepts a safe root-relative path with query params', () => {
    expect(isSafeAuthRedirect('/dashboard?tab=settings')).toBe(true);
  });
});
