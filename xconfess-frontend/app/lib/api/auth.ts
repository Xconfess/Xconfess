import {
  AppError,
  getStatusCodeString,
  getStatusMessage,
  logError,
  LOGIN_ATTEMPT_FAILED_MESSAGE,
} from '@/app/lib/utils/errorHandler';

export interface AuthTokenPayload {
  sub: string;
  email?: string;
  iat: number;
  exp: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
}

export function saveToken(): void {
  // Persistence is now handled via HttpOnly session cookies
}

export async function getToken(): Promise<string | null> {
  // In client-side, we don't have direct access to HttpOnly tokens.
  // We should rely on the session API to verify authentication.
  return null;
}

export async function removeToken(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" }).catch((error) => {
    // Logout must never block on a network failure, but a silently
    // swallowed error here made this flow inconsistent with login/session
    // refresh, which always log what went wrong.
    logError(
      toNetworkAwareAppError(error, "/api/auth/session"),
      "removeToken",
    );
  });
}

export function decodeToken(token: string): AuthTokenPayload | null {
  try {
    const base64Payload = token.split(".")[1];
    if (!base64Payload) return null;

    const base64 = base64Payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(base64Payload.length / 4) * 4, "=");

    const decoded = atob(base64);
    return JSON.parse(decoded) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/session");
    return response.ok;
  } catch (error) {
    // Network failure is not itself an auth error, but it must not be
    // conflated with "no session" — log it so it's distinguishable from a
    // genuine 401, then treat the caller as unauthenticated.
    logError(
      toNetworkAwareAppError(error, "/api/auth/session"),
      "isAuthenticated",
    );
    return false;
  }
}

export async function getCurrentUser(): Promise<AuthTokenPayload | null> {
  try {
    const response = await fetch("/api/auth/session");
    if (!response.ok) {
      const appError = await appErrorFromResponse(response, "/api/auth/session");
      // A missing/expired session is an expected outcome for this accessor,
      // not a failure worth logging — every other status is.
      if (!(response.status === 401)) {
        logError(appError, "getCurrentUser");
      }
      return null;
    }
    const data = await response.json();
    return data.user;
  } catch (error) {
    logError(
      toNetworkAwareAppError(error, "/api/auth/session"),
      "getCurrentUser",
    );
    return null;
  }
}

export async function login(
  credentials: LoginCredentials,
): Promise<AuthTokenPayload> {
  let response: Response;
  try {
    response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
  } catch (error) {
    const appError = toNetworkAwareAppError(error, "/api/auth/session");
    logError(appError, "login");
    throw appError;
  }

  if (!response.ok) {
    const appError = await appErrorFromResponse(
      response,
      "/api/auth/session",
      response.status === 401 ? LOGIN_ATTEMPT_FAILED_MESSAGE : undefined,
    );
    logError(appError, "login", { status: response.status });
    throw appError;
  }

  const data = await response.json();
  return data.user;
}

/**
 * Build a normalized AppError from a non-ok fetch Response, matching the
 * mapping used across the other authentication flows (login, register,
 * session refresh) so every path here surfaces the same user-facing
 * messages instead of raw server/database error strings.
 */
async function appErrorFromResponse(
  response: Response,
  path: string,
  overrideMessage?: string,
): Promise<AppError> {
  const body = await response.json().catch(() => ({}));
  const status = response.status;
  const rawApi =
    (body && ((body as any).message || (body as any).error)) || null;
  const message =
    overrideMessage ??
    (typeof rawApi === "string" && rawApi.trim().length > 0
      ? rawApi
      : getStatusMessage(status));
  const code = getStatusCodeString(status);
  return new AppError(message, code, status, {
    responseBody: body,
    path,
    upstreamMessage: typeof rawApi === "string" ? rawApi : undefined,
  });
}

/** Wrap a thrown fetch error (network failure, abort, etc.) as an AppError. */
function toNetworkAwareAppError(error: unknown, path: string): AppError {
  if (error instanceof AppError) return error;
  const message =
    error instanceof Error && error.message
      ? "Network error. Please check your internet connection."
      : "An unexpected error occurred. Please try again.";
  return new AppError(message, "NETWORK_ERROR", 0, { path });
}

export function logout(): void {
  removeToken();
}

export async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Route all calls through the Next.js /api proxy so that browser-facing
  // code never contacts the backend host directly. Session cookies are
  // forwarded automatically by the proxy.
  //
  // Callers must pass a path that begins with "/api/", e.g. "/api/auth/session".
  // If a bare backend path is passed (no /api/ prefix) it is rewritten to
  // use the proxy so no direct backend URL ever leaves the browser.
  const proxyPath = path.startsWith("/api/") ? path : `/api${path}`;

  return fetch(proxyPath, {
    ...options,
    headers,
    credentials: "same-origin",
  });
}
