import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { resolveBackendRoute } from "@/app/lib/api/proxy";


export async function GET(request: NextRequest) {
  const correlationId = request.headers.get("X-Correlation-ID") || "unknown";

  try {
    // Get auth token from headers
    const token = request.headers.get("authorization")?.replace("Bearer ", "");

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type");
    const isRead = searchParams.get("isRead");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const backend = resolveBackendRoute(
      request,
      `/notifications?type=${type || ""}&isRead=${isRead || ""}&page=${page}&limit=${limit}`,
    );

    // Call your backend API
    const response = await fetch(
      backend.url,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: response.status,
          upstreamResponse: response,
        correlationId,
        fallbackMessage: "Failed to fetch notifications",
        route: "GET /api/notifications",
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      correlationId,
      route: "GET /api/notifications",
    });
  }
}
