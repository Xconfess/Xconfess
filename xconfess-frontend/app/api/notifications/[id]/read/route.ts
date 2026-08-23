import { NextRequest, NextResponse } from "next/server";
import { methodNotAllowed } from "@/app/lib/api/proxy";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { getApiBaseUrl } from "@/app/lib/config";


export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const BACKEND_API_URL = getApiBaseUrl();
  try {
    const { id } = await context.params;
    const token = request.headers.get("authorization")?.replace("Bearer ", "");

    const response = await fetch(
      `${BACKEND_API_URL}/notifications/${id}/read`,
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
        fallbackMessage: "Failed to mark notification as read",
        route: "PATCH /api/notifications/[id]/read"
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      route: "PATCH /api/notifications/[id]/read"
    });
  }
}


export async function GET(_request: Request) {
  return methodNotAllowed("GET", ["PATCH"]);
}

export async function POST(_request: Request) {
  return methodNotAllowed("POST", ["PATCH"]);
}

export async function PUT(_request: Request) {
  return methodNotAllowed("PUT", ["PATCH"]);
}

export async function DELETE(_request: Request) {
  return methodNotAllowed("DELETE", ["PATCH"]);
}
