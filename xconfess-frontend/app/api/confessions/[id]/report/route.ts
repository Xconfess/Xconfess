import { getApiBaseUrl } from "@/app/lib/config";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";


const ALLOWED_TYPES = new Set([
  "spam",
  "harassment",
  "hate_speech",
  "inappropriate_content",
  "copyright",
  "other",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const BASE_API_URL = getApiBaseUrl();
  try {
    const { id } = await context.params;
    if (!id) {
      return createApiErrorResponse("Confession ID is required", { status: 400 });
    }

    const body = await request.json().catch(() => ({} as any));
    const type = body?.type;
    const reason = typeof body?.reason === "string" ? body.reason : undefined;

    if (!type || !ALLOWED_TYPES.has(type)) {
      return createApiErrorResponse("Invalid report type", { status: 400 });
    }

    const anonymousUserId = request.headers.get("x-anonymous-user-id");
    const authorization = request.headers.get("authorization");

    // The backend allows anonymous reports only if we supply x-anonymous-user-id.
    if (!authorization && !anonymousUserId) {
      return createApiErrorResponse("Missing anonymous user ID", { status: 401 });
    }

    const idempotencyKey = request.headers.get("idempotency-key");

    const forwardedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (authorization) forwardedHeaders["Authorization"] = authorization;
    if (anonymousUserId) forwardedHeaders["x-anonymous-user-id"] = anonymousUserId;
    if (idempotencyKey) forwardedHeaders["idempotency-key"] = idempotencyKey;

    const res = await fetch(`${BASE_API_URL}/confessions/${id}/report`, {
      method: "POST",
      headers: forwardedHeaders,
      body: JSON.stringify({ type, reason }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: res.status,
          upstreamResponse: res,
        route: "POST /api/confessions/[id]/report"
      });
    }

    const text = await res.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { message: text };
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return createApiErrorResponse(err, {
      status: 500,
      route: "POST /api/confessions/[id]/report"
    });
  }
}

