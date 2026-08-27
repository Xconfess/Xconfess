import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { getApiBaseUrl } from "@/app/lib/config";


export async function PATCH(request: NextRequest) {
  const BACKEND_API_URL = getApiBaseUrl();
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");

    const response = await fetch(
      `${BACKEND_API_URL}/notifications/read-all`,
      {
        method: "PATCH",
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
        fallbackMessage: "Failed to mark all as read",
        route: "PATCH /api/notifications/read-all"
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      route: "PATCH /api/notifications/read-all"
    });
  }
}

