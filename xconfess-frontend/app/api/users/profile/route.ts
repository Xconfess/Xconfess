import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { getApiBaseUrl } from "@/app/lib/config";


export async function GET(request: Request) {
  const BASE_API_URL = getApiBaseUrl();
  const correlationId = request.headers.get("X-Correlation-ID") || "unknown";

  try {
    const backendUrl = `${BASE_API_URL}/users/profile`;

    // Forward cookies for auth
    const cookie = request.headers.get("cookie") || "";

    const response = await fetch(backendUrl, {
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
        route: "GET /api/users/profile"
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
      route: "GET /api/users/profile"
    });
  }
}

export async function PATCH(request: Request) {
  const BASE_API_URL = getApiBaseUrl();
  const correlationId = request.headers.get("X-Correlation-ID") || "unknown";

  try {
    const body = await request.json();
    const backendUrl = `${BASE_API_URL}/users/profile`;

    const cookie = request.headers.get("cookie") || "";

    const response = await fetch(backendUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": correlationId,
        "cookie": cookie,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: response.status,
          upstreamResponse: response,
        correlationId,
        route: "PATCH /api/users/profile"
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
      route: "PATCH /api/users/profile"
    });
  }
}

