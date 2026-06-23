import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { getApiBaseUrl } from "@/app/lib/config";

const BASE_API_URL = getApiBaseUrl();

export async function POST(request: Request) {
  const correlationId = request.headers.get("X-Correlation-ID") || "unknown";

  try {
    const backendUrl = `${BASE_API_URL}/data-export/request`;
    const cookie = request.headers.get("cookie") || "";

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "X-Correlation-ID": correlationId,
        "cookie": cookie,
      },
      credentials: "include",
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: response.status,
        correlationId,
        route: "POST /api/data-export/request",
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
      route: "POST /api/data-export/request",
    });
  }
}
