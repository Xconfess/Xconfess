import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiBaseUrl } from "@/app/lib/config";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import {
  normalizeAuthError,
  retryAuthOperation,
} from "@/lib/normalizeAuthError";

const API_URL = getApiBaseUrl();
const SESSION_COOKIE_NAME = "xconfess_session";

/**
 * POST /api/auth/session
 * Login proxy with retry logic for transient errors.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email : undefined;
    const password =
      typeof body?.password === "string" ? body.password : undefined;

    if (!email || !password) {
      return createApiErrorResponse("Email and password are required", {
        status: 400,
      });
    }

    // Wrap the login operation for potential retries on transient errors
    let loginResponse: Response;
    let loginData: any;

    try {
      await retryAuthOperation(async () => {
        loginResponse = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!loginResponse.ok) {
          const errorData = await loginResponse
            .json()
            .catch(() => ({ message: "Login failed" }));
          const error = new Error(errorData.message || "Login failed");
          (error as any).status = loginResponse.status;
          (error as any).originalData = errorData;
          throw error;
        }

        loginData = await loginResponse.json();
      }, 1); // Max 1 retry for login
    } catch (error) {
      const normalized = normalizeAuthError(error);

      // Log the normalized error for debugging
      console.error(`[POST /api/auth/session] Auth error:`, normalized);

      // Return appropriate error response
      // AuthProvider will use the normalized shape to decide on retry/logout
      return createApiErrorResponse(
        {
          message: normalized.message,
          code: normalized.code,
          type: normalized.type,
          retryable: normalized.retryable,
        },
        {
          status: normalized.originalStatus || 500,
          fallbackMessage: normalized.message,
          route: "POST /api/auth/session",
        },
      );
    }

    const token = loginData.access_token;
    if (!token) {
      return createApiErrorResponse("No token in login response", {
        status: 500,
      });
    }

    // Set secure HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: "/",
    });

    return NextResponse.json({
      user: loginData.user,
      anonymousUserId: loginData.anonymousUserId ?? null,
    });
  } catch (error) {
    const normalized = normalizeAuthError(error);
    console.error(`[POST /api/auth/session] Unexpected error:`, normalized);
    return createApiErrorResponse(normalized.message, {
      status: 500,
      fallbackMessage: "An unexpected error occurred during login",
      route: "POST /api/auth/session",
    });
  }
}

/**
 * GET /api/auth/session
 * Retrieve current session with retry logic for transient errors.
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return createApiErrorResponse("Not authenticated", { status: 401 });
  }

  try {
    let response: Response;

    // Wrap session check with retry for transient errors only
    await retryAuthOperation(async () => {
      // Try new canonical endpoint first
      response = await fetch(`${API_URL}/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Fallback to legacy endpoint if not found
      if (!response.ok && response.status === 404) {
        response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      // Throw error if response is not ok (will be caught and normalized)
      if (!response.ok) {
        const error = new Error(
          response.status === 401
            ? "Session expired"
            : `Session check failed: ${response.status}`,
        );
        (error as any).status = response.status;
        throw error;
      }
    }, 1); // Max 1 retry for session check

    const user = await response!.json();

    return NextResponse.json({ authenticated: true, user });
  } catch (error) {
    const normalized = normalizeAuthError(error);

    console.error(`[GET /api/auth/session] Auth error:`, normalized);

    // Clear session cookie if error is terminal (401/403)
    if (normalized.type === "TERMINAL") {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
    }

    // Return normalized error that AuthProvider can use
    return createApiErrorResponse(
      {
        message: normalized.message,
        code: normalized.code,
        type: normalized.type,
        retryable: normalized.retryable,
      },
      {
        status: normalized.originalStatus || 500,
        fallbackMessage: normalized.message,
        route: "GET /api/auth/session",
      },
    );
  }
}

/**
 * DELETE /api/auth/session
 * Logout and clear session cookie.
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  return NextResponse.json({ success: true });
}
