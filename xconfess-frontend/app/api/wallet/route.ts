import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { methodNotAllowedHandlers, resolveBackendRoute } from "@/app/lib/api/proxy";

async function forward(request: Request) {
  const correlationId = request.headers.get("X-Correlation-ID") || "unknown";
  try {
    const backend = resolveBackendRoute(request, "/wallet");
    const response = await fetch(backend.url, {
      method: "GET",
      headers: {
        "X-Correlation-ID": correlationId,
        cookie: request.headers.get("cookie") || "",
      },
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    });
  } catch (error) {
    return createApiErrorResponse(error, { status: 500, correlationId, route: "GET /api/wallet" });
  }
}

export function GET(request: Request) {
  return forward(request);
}

export const { POST, PUT, PATCH, DELETE } = methodNotAllowedHandlers(["GET"]);
