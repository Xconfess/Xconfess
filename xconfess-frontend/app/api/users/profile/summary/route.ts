import { NextRequest, NextResponse } from "next/server";
import { resolveBackendRoute } from "@/app/lib/api/proxy";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";


/**
 * GET /api/users/profile/summary
 * Server-side proxy — browser-facing code must call this route, never the backend directly.
 */
export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("X-Correlation-ID") || "unknown";

  try {
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const backend = resolveBackendRoute(
      request,
      `/users/profile/summary${qs ? `?${qs}` : ""}`,
    );

    const cookie = request.headers.get("cookie") || "";

    const response = await fetch(backend.url, {
      method: "GET",
      headers: {
        "X-Correlation-ID": correlationId,
        cookie,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: response.status,
        upstreamResponse: response,
        correlationId,
        route: "GET /api/users/profile/summary",
      });
    }

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      correlationId,
      route: "GET /api/users/profile/summary",
    });
  }
}
