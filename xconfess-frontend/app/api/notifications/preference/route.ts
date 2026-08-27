import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { getApiBaseUrl } from "@/app/lib/config";


export async function GET(request: NextRequest) {
  const BACKEND_API_URL = getApiBaseUrl();
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");

    const response = await fetch(
      `${BACKEND_API_URL}/notifications/preferences`,
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
        fallbackMessage: "Failed to fetch preferences",
        route: "GET /api/notifications/preference"
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      route: "GET /api/notifications/preference"
    });
  }
}

export async function PUT(request: NextRequest) {
  const BACKEND_API_URL = getApiBaseUrl();
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const body = await request.json();

    const response = await fetch(
      `${BACKEND_API_URL}/notifications/preferences`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: response.status,
          upstreamResponse: response,
        fallbackMessage: "Failed to save preferences",
        route: "PUT /api/notifications/preference"
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      route: "PUT /api/notifications/preference"
    });
  }
}

