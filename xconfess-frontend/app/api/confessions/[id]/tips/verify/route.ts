import { getApiBaseUrl } from "@/app/lib/config";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";

const BASE_API_URL = getApiBaseUrl();
const TX_ID_PATTERN = /^[a-fA-F0-9]{64}$/;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const txId = typeof body?.txId === "string" ? body.txId : body?.txHash;

    if (!id) {
      return createApiErrorResponse("Confession ID is required", { status: 400 });
    }

    if (typeof txId !== "string" || !TX_ID_PATTERN.test(txId)) {
      return createApiErrorResponse("Transaction ID must be a valid 64-character hex string", {
        status: 400,
        route: "POST /api/confessions/[id]/tips/verify",
      });
    }

    const response = await fetch(`${BASE_API_URL}/confessions/${id}/tips/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId }),
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      return createApiErrorResponse(payload, {
        status: response.status,
        route: "POST /api/confessions/[id]/tips/verify",
      });
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      route: "POST /api/confessions/[id]/tips/verify",
    });
  }
}
