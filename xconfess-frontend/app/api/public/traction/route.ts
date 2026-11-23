import { resolveBackendRoute, methodNotAllowedHandlers } from "@/app/lib/api/proxy";
import { getOrCreateRequestId, requestIdResponseHeaders } from "@/app/lib/utils/requestId";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  try {
    const backend = resolveBackendRoute(request, "/public/traction");
    const response = await fetch(backend.url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
      next: { revalidate: 60 },
    });

    const data = await response.json().catch(() => ({}));

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        ...requestIdResponseHeaders(requestId),
      },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 503,
      correlationId: requestId,
      fallbackMessage: "Public traction endpoint unreachable",
      route: "GET /api/public/traction",
    });
  }
}

export const { POST, PUT, PATCH, DELETE } = methodNotAllowedHandlers(["GET"]);
