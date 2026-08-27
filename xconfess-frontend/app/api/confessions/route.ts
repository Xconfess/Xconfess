import { normalizeConfession } from "../../lib/utils/normalizeConfession";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { getApiBaseUrl } from "@/app/lib/config";
import { getOrCreateRequestId, requestIdResponseHeaders } from "@/app/lib/utils/requestId";

export async function POST(request: Request) {
  const BASE_API_URL = getApiBaseUrl();
  const correlationId = getOrCreateRequestId(request);

  try {
    const body = await request.json();
    const { title, message, body: bodyContent, gender, stellarTxHash, idempotencyKey } = body;

    if (!message && !bodyContent) {
      return createApiErrorResponse("Confession content is required", { 
        status: 400,
        correlationId 
      });
    }

    const confessionContent = bodyContent || message;
    const backendUrl = `${BASE_API_URL}/confessions`;

    const backendBody: any = {
      message: confessionContent,
      body: confessionContent,
    };

    if (title) backendBody.title = title;
    if (gender) backendBody.gender = gender;
    if (stellarTxHash) backendBody.stellarTxHash = stellarTxHash;
    if (idempotencyKey) backendBody.idempotencyKey = idempotencyKey;

    // Forward client-supplied Idempotency-Key header or fall back to body field.
    const clientIdempotencyKey =
      request.headers.get("idempotency-key") ||
      request.headers.get("Idempotency-Key") ||
      idempotencyKey;

    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-request-id": correlationId,
    };

    if (clientIdempotencyKey) {
      forwardHeaders["Idempotency-Key"] = clientIdempotencyKey;
      // Also include in body for backends that read it from there.
      backendBody.idempotencyKey = clientIdempotencyKey;
    }

    try {
      const response = await fetch(backendUrl, {
        method: "POST",
        headers: forwardHeaders,
        body: JSON.stringify(backendBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return createApiErrorResponse(errorData, {
          status: response.status,
          upstreamResponse: response,
          correlationId,
          fallbackMessage: `Failed to create confession: ${response.statusText}`,
          route: "POST /api/confessions"
        });
      }

      const data = await response.json();
      const normalized = normalizeConfession(data);

      return new Response(JSON.stringify(normalized), {
        status: 201,
        headers: { "Content-Type": "application/json", ...requestIdResponseHeaders(correlationId) },
      });
    } catch (fetchError) {
      return createApiErrorResponse(fetchError, {
        status: 503,
        correlationId,
        fallbackMessage: "Backend service unreachable",
        route: "POST /api/confessions"
      });
    }
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      correlationId,
      route: "POST /api/confessions"
    });
  }
}

export async function GET(request: Request) {
  const BASE_API_URL = getApiBaseUrl();
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? "10") || 10);
  const sort = searchParams.get("sort") ?? "newest";
  const gender = searchParams.get("gender");

  const backendParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    sort: sort,
  });

  if (gender) {
    backendParams.append("gender", gender);
  }

  const correlationId = getOrCreateRequestId(request);

  try {
    const backendUrl = `${BASE_API_URL}/confessions?${backendParams}`;

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": correlationId,
      },
      next: {
        revalidate: 30, // Cache for 30 seconds
      },
    });

    if (!response.ok) {
      return createApiErrorResponse(undefined, {
        status: response.status,
          upstreamResponse: response,
        correlationId,
        fallbackMessage: `Failed to fetch confessions: ${response.statusText}`,
        route: "GET /api/confessions"
      });
    }

    const data = await response.json();
    const rawConfessions = data.data || data.confessions || [];
    const confessions = rawConfessions.map(normalizeConfession);

    // ✅ Compute pagination metadata properly
    const total = data.total ?? confessions.length;
    const totalPages = data.totalPages ?? Math.ceil(total / limit);

    const hasMore =
      page < totalPages || (totalPages === undefined && confessions.length > 0);

    return new Response(
      JSON.stringify({
        confessions,
        meta: {
          page,
          limit,
          total,
          totalPages,
          hasMore,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...requestIdResponseHeaders(correlationId) },
      },
    );
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 503,
      correlationId,
      fallbackMessage: "Backend service unreachable",
      route: "GET /api/confessions"
    });
  }
}

