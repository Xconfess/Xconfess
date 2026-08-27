/**
 * Example: Updated auth/session proxy route with normalized error handling and retry logic.
 * 
 * This demonstrates how to use normalizeAuthError for consistent error handling
 * and avoid retry loops for TERMINAL errors.
 * 
 * Copy this pattern to other auth proxy routes (/app/api/auth/*).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiBaseUrl } from "@/app/lib/config";
import {
  normalizeAuthError,
  NormalizedAuthError,
} from "@/lib/normalizeAuthError";

const API_URL = getApiBaseUrl();
const SESSION_COOKIE_NAME = "xconfess_session";
const MAX_RETRIES = 1;

/**
 * Helper to fetch from backend with automatic retry for TRANSIENT errors.
 * Returns { success, data, normalized } to caller.
 */
async function fetchBackendWithRetry(
  url: string,
  options: RequestInit = {}
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  normalized?: NormalizedAuthError;
}> {
  let lastNormalized: NormalizedAuthError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const normalized = normalizeAuthError(errorData, {
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

/**
 * POST /api/auth/session
 * Login with email/password. Returns user and token.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email : undefined;
    const password = typeof body?.password === "string" ? body.password : undefined;

    if (!email || !password) {
      const normalized = normalizeAuthError(
        { code: "INVALID_REQUEST", message: "Email and password are required" },
        { status: 400 }
      );
      return createErrorResponse(normalized);
    }

    // Fetch with automatic retry for TRANSIENT errors
    const result = await fetchBackendWithRetry(`${API_URL}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!result.success) {
      return createErrorResponse(result.normalized!);
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

    return NextResponse.json({
      user: data.user,
      anonymousUserId: data.anonymousUserId ?? null,
    });
  } catch (error) {
    const normalized = normalizeAuthError(error);
    return createErrorResponse(normalized);
  }
}

/**
 * GET /api/auth/session
 * Verify session and get current user info.
 * Tries new endpoint, falls back to legacy endpoint.
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    const normalized = normalizeAuthError(
      { code: "INVALID_SESSION", message: "Not authenticated" },
      { status: 401 }
    );
    return createErrorResponse(normalized);
  }

  try {
    // Try new canonical endpoint first
    let result = await fetchBackendWithRetry(`${API_URL}/auth/session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // 404 Not Found? Try fallback to legacy endpoint
    if (!result.success && result.normalized?.originalStatus === 404) {
      result = await fetchBackendWithRetry(`${API_URL}/auth/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    if (!result.success) {
      // If 401, clear the invalid session cookie
      if (result.normalized?.originalStatus === 401) {
        cookieStore.delete(SESSION_COOKIE_NAME);
      }
      return createErrorResponse(result.normalized!);
    }

    const user = result.data as Record<string, unknown>;
    return NextResponse.json({ authenticated: true, user });
  } catch (error) {
    const normalized = normalizeAuthError(error);
    return createErrorResponse(normalized);
  }
}

/**
 * DELETE /api/auth/session
 * Logout: clear the session cookie.
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ success: true });
}

/**
 * Convert normalized auth error to JSON response.
 * Output shape matches NormalizedAuthError so AuthProvider can consume it directly.
 */
function createErrorResponse(normalized: NormalizedAuthError): Response {
  // Log for debugging
  if (process.env.NODE_ENV === "development") {
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

  return new Response(
    JSON.stringify({
      type: normalized.type,
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      originalStatus: normalized.originalStatus,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}
