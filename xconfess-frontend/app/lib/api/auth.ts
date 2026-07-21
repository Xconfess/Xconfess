import { getApiBaseUrl } from "@/app/lib/config";
import type { LoginCredentials, LoginResponse, User } from "../types/auth";

const API_URL = getApiBaseUrl();
const SESSION_ROUTE = "/api/auth/session";

export interface AuthTokenPayload {
  sub: string;
  email?: string;
  iat: number;
  exp: number;
}

export type { LoginCredentials, LoginResponse, User };

export function saveToken(): void {
  // Persistence is now handled via HttpOnly session cookies
}

export async function getToken(): Promise<string | null> {
  // In client-side, we don't have direct access to HttpOnly tokens.
  // We should rely on the session API to verify authentication.
  return null;
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

async function requestSession(options: RequestInit = {}): Promise<Response> {
  return fetch(SESSION_ROUTE, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const response = await requestSession();
    return response.ok;
  } catch {
    return false;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await requestSession();
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    return (data.user ?? null) as User | null;
  } catch {
    return null;
  }
}

export async function refreshSession(): Promise<User | null> {
  try {
    const response = await requestSession();
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    return (data.user ?? null) as User | null;
  } catch {
    return null;
  }
}

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await requestSession({
    method: "POST",
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Login failed" }));
    throw new Error(error.message ?? "Login failed");
  }

  return response.json() as Promise<LoginResponse>;
}

export async function logout(): Promise<void> {
  await requestSession({ method: "DELETE" }).catch(() => {});
}

export async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
}

export const authApi = {
  login,
  refreshSession,
  getCurrentUser,
  logout,
  isAuthenticated,
};

export default authApi;
