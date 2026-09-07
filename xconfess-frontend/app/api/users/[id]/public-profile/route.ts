import { NextRequest } from "next/server";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { resolveBackendRoute } from "@/app/lib/api/proxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const correlationId = req.headers.get("X-Correlation-ID") || "unknown";

  try {
    const { id } = await params;
    const backend = resolveBackendRoute(req, `/users/${id}/public-profile`);

    const response = await fetch(backend.url, {
      method: "GET",
      headers: buildForwardHeaders(req, correlationId),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: response.status,
        upstreamResponse: response,
        correlationId,
        route: "GET /api/users/[id]/public-profile",
      });
    }

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      correlationId,
      route: "GET /api/users/[id]/public-profile",
    });
  }
}

function buildForwardHeaders(
  req: NextRequest,
  correlationId: string,
): HeadersInit {
  const headers: Record<string, string> = {
    cookie: req.headers.get("cookie") ?? "",
    "content-type": "application/json",
    "X-Correlation-ID": correlationId,
  };

  const blockedHeaders = ["x-user-id", "x-forwarded-user", "x-admin-override"];
  for (const h of blockedHeaders) {
    delete headers[h];
  }

  return headers;
}
