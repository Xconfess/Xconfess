import { CookieOptions } from 'express';

/**
 * Centralised session-cookie configuration for the NestJS backend.
 *
 * Architecture context (see docs/adr/001-authentication-strategy.md):
 * The session cookie is written by the Next.js route handler
 * (xconfess-frontend/app/api/auth/session/route.ts) on the frontend origin.
 * The backend remains stateless JWT and does not set the session cookie on
 * normal requests.  However, the backend logout endpoint MUST emit a
 * Set-Cookie header that expires the session cookie so that clients which
 * call POST /api/auth/logout directly (e.g. via credentials:"include" from a
 * same-origin page) have the cookie cleared reliably by the browser.
 *
 * The cookie name and all attributes MUST match whatever the frontend writes,
 * otherwise the browser will not evict the cookie on logout.
 *
 * Security properties
 * -------------------
 * HttpOnly  – token is invisible to JavaScript (XSS mitigation).
 * Secure    – HTTPS-only in production; intentionally false in local dev
 *             (localhost does not use TLS by default — see LOCAL DEV note).
 * SameSite  – "strict": cookie never sent on cross-site requests (CSRF).
 * Path      – "/": scoped to the entire app.
 *
 * LOCAL DEV EXCEPTION
 * -------------------
 * When NODE_ENV !== "production", Secure is false so the cookie is accepted
 * over plain HTTP on localhost.  This is intentional and safe because
 * localhost is not reachable from the public internet.  Never deploy with
 * NODE_ENV=development on a public host.
 */

/** The cookie name shared between backend and frontend. */
export const SESSION_COOKIE_NAME = 'xconfess_session';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Express CookieOptions used when the backend needs to clear the session
 * cookie (e.g. on logout).  The attributes must exactly match the ones used
 * when the cookie was written so the browser reliably evicts it.
 */
export const SESSION_COOKIE_CLEAR_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/',
  // maxAge 0 and expires in the past both instruct the browser to delete the cookie.
  maxAge: 0,
  expires: new Date(0),
};
