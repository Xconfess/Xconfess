import { resolveBackendRoute } from "@/app/lib/api/proxy";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { getOrCreateRequestId, requestIdResponseHeaders } from "@/app/lib/utils/requestId";


export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  try {
    const backend = resolveBackendRoute(request, "/health/ready");
    const response = await fetch(backend.url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
      next: { revalidate: 0 },
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...requestIdResponseHeaders(requestId),
      },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 503,
      correlationId: requestId,
      fallbackMessage: "Health check endpoint unreachable",
      route: "GET /api/health/ready",
    });
  }
}
