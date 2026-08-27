import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/app/lib/config";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";


/**
 * GET /api/users/profile/summary
 * Server-side proxy — browser-facing code must call this route, never the backend directly.
 */
export async function GET(request: NextRequest) {
  const BASE_API_URL = getApiBaseUrl();
  const correlationId =
    request.headers.get("X-Correlation-ID") || "unknown";

  try {
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const backendUrl = `${BASE_API_URL}/users/profile/summary${qs ? `?${qs}` : ""}`;

    const cookie = request.headers.get("cookie") || "";

    const response = await fetch(backendUrl, {
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
