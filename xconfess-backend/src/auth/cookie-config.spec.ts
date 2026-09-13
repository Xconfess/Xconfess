/**
 * Unit tests for cookie-config module.
 *
 * These tests verify that:
 *  1. SESSION_COOKIE_CLEAR_OPTIONS has all required security attributes.
 *  2. Security attributes match production requirements (HttpOnly, SameSite=Strict).
 *  3. Secure flag is environment-aware (false in test/dev, true in production).
 *  4. Cookie name is consistent with the frontend.
 */

import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_CLEAR_OPTIONS,
} from './cookie-config';

describe('cookie-config — centralized backend cookie options', () => {
  describe('SESSION_COOKIE_NAME', () => {
    it('is xconfess_session (matches frontend)', () => {
      expect(SESSION_COOKIE_NAME).toBe('xconfess_session');
    });
  });

  describe('SESSION_COOKIE_CLEAR_OPTIONS', () => {
    it('has httpOnly: true for XSS protection', () => {
      expect(SESSION_COOKIE_CLEAR_OPTIONS.httpOnly).toBe(true);
    });

    it('has sameSite: strict for CSRF protection', () => {
      expect(SESSION_COOKIE_CLEAR_OPTIONS.sameSite).toBe('strict');
    });

    it('has path: / to scope cookie to entire app', () => {
      expect(SESSION_COOKIE_CLEAR_OPTIONS.path).toBe('/');
    });

    it('has maxAge: 0 to expire cookie immediately', () => {
      expect(SESSION_COOKIE_CLEAR_OPTIONS.maxAge).toBe(0);
    });

    it('has expires set to Unix epoch (Jan 1, 1970)', () => {
      expect(SESSION_COOKIE_CLEAR_OPTIONS.expires?.valueOf()).toBe(
        new Date(0).valueOf(),
      );
    });

    it('Secure flag is false in test environment (NODE_ENV !== production)', () => {
      // Tests run with NODE_ENV=test; Secure must be false so tests work on plain HTTP.
      // Production enforcement is validated by the isProduction conditional in cookie-config.ts.
      expect(process.env.NODE_ENV).not.toBe('production');
      expect(SESSION_COOKIE_CLEAR_OPTIONS.secure).toBe(false);
    });

    it('contains all required attributes for reliable cookie clearing', () => {
      // The browser only removes a cookie when the Set-Cookie header's name +
      // path + domain + sameSite combination matches the original attributes.
      expect(SESSION_COOKIE_CLEAR_OPTIONS).toMatchObject({
        httpOnly: true,
        secure: expect.any(Boolean),
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
        expires: expect.any(Date),
      });
    });
  });

  describe('Environment-aware Secure flag', () => {
    it('Secure flag reflects NODE_ENV at module load time', () => {
      // In test/dev: secure should be false
      // In production: secure should be true
      const isProduction = process.env.NODE_ENV === 'production';
      expect(SESSION_COOKIE_CLEAR_OPTIONS.secure).toBe(isProduction);
    });
  });
});
