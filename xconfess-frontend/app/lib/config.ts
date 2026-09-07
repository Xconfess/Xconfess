/**
 * Canonical Backend URL Resolution
 *
 * Server-side: Uses BACKEND_API_URL (private)
 * Client-side: Uses NEXT_PUBLIC_API_URL (public)
 */

const normalizeBackendApiUrl = (url: string): string => {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

export const getApiBaseUrl = (): string => {
  // Server-side
  if (typeof window === "undefined") {
    const serverUrl = process.env.BACKEND_API_URL;

    if (serverUrl) {
      return normalizeBackendApiUrl(serverUrl);
    }

    // Safe fallback during build/prerender.
    // Runtime API routes should handle an unavailable backend.
    return normalizeBackendApiUrl("http://localhost:5000");
  }

  // Client-side
  const clientUrl = process.env.NEXT_PUBLIC_API_URL;

  if (clientUrl) {
    return normalizeBackendApiUrl(clientUrl);
  }

  return normalizeBackendApiUrl("http://localhost:5000");
};

/**
 * Canonical WebSocket URL Resolution
 *
 * Client-side: Uses NEXT_PUBLIC_WS_URL (public)
 */
export const getWsUrl = (): string => {
  if (typeof window === "undefined") {
    return "ws://localhost:5000";
  }

  return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:5000";
};