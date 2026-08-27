import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { methodNotAllowed, resolveBackendRoute } from "@/app/lib/api/proxy";

export async function POST(request: Request) {
  let correlationId = request.headers.get("X-Request-ID") || request.headers.get("X-Correlation-ID") || "unknown";

  try {
    const body = await request.json();
    const backend = resolveBackendRoute(request, "/users/register");
    correlationId = backend.requestId;

    const response = await fetch(backend.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": correlationId,
        "X-Correlation-ID": correlationId,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.clone().json().catch(async () => ({
        message: await response.text().catch(() => response.statusText),
      }));
      return createApiErrorResponse(errData, {
        status: response.status,
        upstreamResponse: response,
        correlationId,
        route: "POST /api/users/register",
      });
    }

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": correlationId,
      },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status:
        error instanceof Error && error.message.includes("BACKEND_API_URL")
          ? 503
          : 500,
      correlationId,
      route: "POST /api/users/register",
    });
  }
}

export async function GET() {
  return methodNotAllowed("GET", ["POST"]);
}
