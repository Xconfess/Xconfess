import { getApiBaseUrl } from "@/app/lib/config";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";

const BASE_API_URL = getApiBaseUrl();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return createApiErrorResponse("Confession ID is required", { status: 400 });
    }

    const response = await fetch(`${BASE_API_URL}/confessions/${id}/tips/stats`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      return createApiErrorResponse(payload, {
        status: response.status,
        route: "GET /api/confessions/[id]/tips/stats",
      });
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      route: "GET /api/confessions/[id]/tips/stats",
    });
  }
}
