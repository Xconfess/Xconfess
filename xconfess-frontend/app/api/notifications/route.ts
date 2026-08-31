import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { getApiBaseUrl } from "@/app/lib/config";
import { methodNotAllowedHandlers } from "@/app/lib/api/proxy";


export async function GET(request: NextRequest) {
  const BACKEND_API_URL = getApiBaseUrl();
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

    // Call your backend API
    const response = await fetch(
      `${BACKEND_API_URL}/notifications?type=${type || ""}&isRead=${isRead || ""}&page=${page}&limit=${limit}`,
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

export const { POST, PUT, PATCH, DELETE } = methodNotAllowedHandlers(["GET"]);

