/**
 * Centralized session cookie configuration.
 *
 * Architecture note (see docs/adr/001-authentication-strategy.md):
 * The NestJS backend is stateless JWT. It returns `access_token` as JSON.
 * The Next.js route handler (app/api/auth/session/route.ts) is the sole place
 * that reads, sets, and clears the session cookie — the backend never touches it.
 *
 * Security properties:
 *  - HttpOnly: token is invisible to JavaScript (XSS mitigation)
 *  - Secure: HTTPS-only in production; intentionally disabled in local dev
 *    (localhost does not use HTTPS by default — see LOCAL DEV note below)
 *  - SameSite=Strict: cookie is never sent on cross-site requests, preventing CSRF
 *  - path=/: cookie is scoped to the entire app
 *  - maxAge: 7 days, matching the JWT expiry in the backend
 *
 * LOCAL DEV EXCEPTION:
 *  When NODE_ENV !== "production", `secure` is false so the cookie is sent over
 *  plain HTTP on localhost. This is intentional and safe for local development
 *  because localhost is not reachable from the internet. Never deploy with
 *  NODE_ENV=development to a public host.
 *
 *  If you need to test the Secure flag locally, use a self-signed certificate
 *  with `next dev --experimental-https` and set NODE_ENV=production in your
 *  .env.local (never commit that change).
 */

export const SESSION_COOKIE_NAME = "xconfess_session";

/** Full set of options used when writing the cookie. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days — keep in sync with JWT_EXPIRY in the backend
} satisfies {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAge: number;
};

/**
 * The minimal tuple required to reliably clear the cookie.
 * The browser only removes a cookie when the Set-Cookie header's name +
 * path + domain + sameSite combination matches the original attributes.
 * We explicitly pass these here so logout is robust even if the browser
 * has stored older versions of the cookie with different attributes.
 */
export const SESSION_COOKIE_CLEAR_OPTIONS = {
  httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
  secure: SESSION_COOKIE_OPTIONS.secure,
  sameSite: SESSION_COOKIE_OPTIONS.sameSite,
  path: SESSION_COOKIE_OPTIONS.path,
  maxAge: 0,
  expires: new Date(0),
} satisfies {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAge: number;
  expires: Date;
};
