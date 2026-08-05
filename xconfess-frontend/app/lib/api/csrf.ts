// Frontend CSRF utility
// Reads the CSRF token from the readable cookie and provides the header name.

/** Name of the cookie that the backend sets with the CSRF token. */
export const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
/** Header name that the backend expects for the token. */
export const CSRF_HEADER = 'x-xsrf-token';

/**
 * Retrieves the CSRF token from the cookie.
 * Returns `undefined` if the cookie is not present.
 */
export function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp('(?:^|; )' + CSRF_COOKIE_NAME + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Attaches the CSRF token to a `RequestInit` object's headers.
 * If the token is missing, the original init is returned unchanged.
 */
export function attachCsrfToken(init: RequestInit = {}): RequestInit {
  const token = getCsrfToken();
  if (!token) return init;
  const headers = new Headers(init.headers as HeadersInit);
  headers.set(CSRF_HEADER, token);
  return { ...init, headers };
}
