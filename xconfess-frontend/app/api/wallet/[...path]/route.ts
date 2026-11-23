import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { methodNotAllowedHandlers, resolveBackendRoute } from "@/app/lib/api/proxy";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const endpoint = `/wallet/${path.map((segment) => encodeURIComponent(segment)).join("/")}`;
  const correlationId = request.headers.get("X-Correlation-ID") || "unknown";

  try {
    const backend = resolveBackendRoute(request, endpoint);
    const body = request.method === "GET" ? undefined : await request.text();
    const response = await fetch(backend.url, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": correlationId,
        "X-XSRF-TOKEN": request.headers.get("X-XSRF-TOKEN") || "",
        cookie: request.headers.get("cookie") || "",
      },
      body,
    });

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
        ...(response.headers.get("set-cookie")
          ? { "Set-Cookie": response.headers.get("set-cookie") as string }
          : {}),
      },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      correlationId,
      route: `${request.method} /api/wallet/${path.join("/")}`,
    });
  }
}

export async function GET(request: Request, context: RouteContext) {
  return forward(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context);
}

export const { PUT, PATCH, DELETE } = methodNotAllowedHandlers(["GET", "POST"]);
