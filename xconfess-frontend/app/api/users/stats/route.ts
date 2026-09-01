import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { resolveBackendRoute } from "@/app/lib/api/proxy";


export async function GET(request: Request) {
  const correlationId = request.headers.get("X-Correlation-ID") || "unknown";

  try {
    const backend = resolveBackendRoute(request, "/users/stats");

    const cookie = request.headers.get("cookie") || "";

    const response = await fetch(backend.url, {
      method: "GET",
      headers: {
        "X-Correlation-ID": correlationId,
        "cookie": cookie,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: response.status,
          upstreamResponse: response,
        correlationId,
        route: "GET /api/users/stats"
      });
    }

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": response.headers.get("set-cookie") || "",
      },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      correlationId,
      route: "GET /api/users/stats"
    });
  }
}
