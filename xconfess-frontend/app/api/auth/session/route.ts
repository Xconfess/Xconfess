import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  normalizeAuthError,
  NormalizedAuthError,
} from "@/lib/normalizeAuthError";
import { getOrCreateRequestId, requestIdResponseHeaders } from "@/app/lib/utils/requestId";
import { methodNotAllowedHandlers, resolveBackendRoute } from "@/app/lib/api/proxy";

const SESSION_COOKIE_NAME = "xconfess_session";
const MAX_RETRIES = 1;

/**
 * Helper to fetch from backend with automatic retry for TRANSIENT errors.
 * Returns { success, data, normalized } to caller.
 */
async function fetchBackendWithRetry(
  url: string,
  options: RequestInit = {},
  requestId?: string
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  normalized?: NormalizedAuthError;
}> {
  let lastNormalized: NormalizedAuthError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };
      if (requestId) headers["x-request-id"] = requestId;

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData =
          typeof response.json === "function"
            ? await response.json().catch(() => ({}))
            : {};
        const normalized = normalizeAuthError({
          ...errorData,
          status: response.status,
        });

        // TERMINAL error: don't retry
        if (normalized.type === "TERMINAL") {
          return {
            success: false,
            normalized,
          };
        }

        // TRANSIENT error: can retry
        lastNormalized = normalized;

        if (attempt < MAX_RETRIES) {
          // Wait before retrying (exponential backoff)
          const delayMs = 500 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        return {
          success: false,
          normalized,
        };
      }

      return {
        success: true,
        data: await response.json(),
      };
    } catch (error) {
      const normalized = normalizeAuthError(error);
      lastNormalized = normalized;

      // TERMINAL error: don't retry
      if (normalized.type === "TERMINAL") {
        return {
          success: false,
          normalized,
        };
      }

      // TRANSIENT error: can retry
      if (attempt < MAX_RETRIES) {
        const delayMs = 500 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      return {
        success: false,
        normalized,
      };
    }
  }

  // If we get here, all retries failed
  return {
    success: false,
    normalized: lastNormalized,
  };
}

export async function POST(request: Request) {
    const requestId = getOrCreateRequestId(request);
    try {
        const body = await request.json();
        const email = typeof body?.email === "string" ? body.email : undefined;
        const password = typeof body?.password === "string" ? body.password : undefined;

        if (!email || !password) {
            const normalized = normalizeAuthError({
                code: "INVALID_REQUEST",
                message: "Email and password are required",
                status: 400,
            });
            return createErrorResponse(normalized, requestId);
        }

        const backend = resolveBackendRoute(request, "/auth/login");
        const result = await fetchBackendWithRetry(backend.url, {
            method: "POST",
            body: JSON.stringify({ email, password }),
        }, backend.requestId);

        if (!result.success) {
            return createErrorResponse(result.normalized!, requestId);
        }

        const data = result.data as Record<string, unknown>;
        const token = data.access_token as string;

        // Set secure session cookie
        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 7, // 1 week
            path: "/",
        });

        const res = NextResponse.json({
            user: data.user,
            anonymousUserId: data.anonymousUserId ?? null,
        });
        res.headers.set("x-request-id", requestId);
        return res;
    } catch (error) {
        const normalized = normalizeAuthError(error);
        return createErrorResponse(normalized, requestId);
    }
}

export async function GET(request: Request) {
    const requestId = getOrCreateRequestId(request);
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
        const normalized = normalizeAuthError({
            code: "INVALID_SESSION",
            message: "Not authenticated",
            status: 401,
        });
        return createErrorResponse(normalized, requestId);
    }

    try {
        // Try new canonical endpoint first
        let backend = resolveBackendRoute(request, "/auth/session");
        let result = await fetchBackendWithRetry(backend.url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }, requestId);

        // 404 Not Found? Try fallback to legacy endpoint
        if (!result.success && result.normalized?.originalStatus === 404) {
            backend = resolveBackendRoute(request, "/auth/me");
            result = await fetchBackendWithRetry(backend.url, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }, requestId);
        }

        if (!result.success) {
            // If 401, clear the invalid session cookie
            if (result.normalized?.originalStatus === 401) {
                cookieStore.delete(SESSION_COOKIE_NAME);
            }
            return createErrorResponse(result.normalized!, requestId);
        }

        const user = result.data as Record<string, unknown>;
        const response = NextResponse.json({ authenticated: true, user });
        response.headers.set("x-request-id", requestId);
        return response;
    } catch (error) {
        const normalized = normalizeAuthError(error);
        return createErrorResponse(normalized, requestId);
    }
}

export async function DELETE() {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    return NextResponse.json({ success: true });
}

export const { PUT, PATCH } = methodNotAllowedHandlers(["GET", "POST", "DELETE"]);

/**
 * Convert normalized auth error to JSON response.
 * Output shape matches NormalizedAuthError so AuthProvider can consume it directly.
 */
function createErrorResponse(
  normalized: NormalizedAuthError,
  requestId?: string,
): Response {
  const isExpectedMissingSession =
    normalized.code === "INVALID_SESSION" && normalized.originalStatus === 401;

  if (process.env.NODE_ENV === "development" && !isExpectedMissingSession) {
    console.error(
      `[Auth Error] ${normalized.code} (${normalized.originalStatus || "N/A"})`,
      {
        type: normalized.type,
        message: normalized.message,
        retryable: normalized.retryable,
      }
    );
  }

  const status = normalized.originalStatus || 500;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (requestId) headers["x-request-id"] = requestId;

  return new Response(
    JSON.stringify({
      type: normalized.type,
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      originalStatus: normalized.originalStatus,
      requestId,
    }),
    {
      status,
      headers,
    }
  );
}
