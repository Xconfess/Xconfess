import { createApiErrorResponse } from "@/lib/apiErrorResponse";
import { getApiBaseUrl } from "@/app/lib/config";

const BASE_API_URL = getApiBaseUrl();

export async function GET(request: Request) {
  const correlationId = request.headers.get("X-Correlation-ID") || "unknown";

  try {
    const backendUrl = `${BASE_API_URL}/data-export/history`;
    const cookie = request.headers.get("cookie") || "";

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "X-Correlation-ID": correlationId,
        cookie: cookie,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: response.status,
        correlationId,
        route: "GET /api/users/privacy-settings/export",
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
      route: "GET /api/users/privacy-settings/export",
    });
  }
}

export async function POST(request: Request) {
  const correlationId = request.headers.get("X-Correlation-ID") || "unknown";

  try {
    const backendUrl = `${BASE_API_URL}/data-export/request`;
    const cookie = request.headers.get("cookie") || "";

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": correlationId,
        cookie: cookie,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: response.status,
        correlationId,
        route: "POST /api/users/privacy-settings/export",
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
      route: "POST /api/users/privacy-settings/export",
    });
  }
}
