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
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => { });
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
  } catch {
    return false;
  }
}

export async function getCurrentUser(): Promise<AuthTokenPayload | null> {
  try {
    const response = await fetch("/api/auth/session");
    if (!response.ok) return null;
    const data = await response.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function login(
  credentials: LoginCredentials,
): Promise<AuthTokenPayload> {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Login failed" }));
    throw new Error(error.message ?? "Login failed");
  }

  const data = await response.json();
  return data.user;
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
