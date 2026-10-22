import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { getApiBaseUrl } from "@/app/lib/config";
import { getOrCreateRequestId } from "@/app/lib/utils/requestId";
import { methodNotAllowedHandlers } from "@/app/lib/api/proxy";


async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ confessionId: string }> },
) {
  const BASE_API_URL = getApiBaseUrl();
  let body: Record<string, unknown> = {};
  let content = "";
  let anonymousContextId = "";
  let parentId: unknown = null;
  let correlationId = "";

  try {
    const { confessionId } = await context.params;
    if (!confessionId) {
      return createApiErrorResponse("Confession ID is required", { status: 400 });
    }

    correlationId = getOrCreateRequestId(request);

    body = await request.json().catch(() => ({}));
    content = (body.content ?? body.message) as string;
    anonymousContextId = (body.anonymousContextId ??
      body.contextId ??
      "") as string;
    parentId = body.parentId ?? null;

    if (
      !content ||
      typeof content !== "string" ||
      content.trim().length === 0
    ) {
      return createApiErrorResponse("Comment content is required", {
        status: 400,
        correlationId,
      });
    }

    // Generate a deterministic idempotency key from content + context
    // to deduplicate retried submissions
    const idempotencyKey = await sha256Hex(
      `${confessionId}:${anonymousContextId}:${content.trim()}:${parentId ?? ""}`,
    );

    const authHeader = request.headers.get("Authorization");
    const cookieHeader = request.headers.get("Cookie");
    const url = `${BASE_API_URL}/comments/${confessionId}`;
    const payload: Record<string, unknown> = {
      content: content.trim(),
      anonymousContextId,
      idempotencyKey,
    };
    if (parentId != null) payload.parentId = parentId;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": correlationId,
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const isDemoMode =
        process.env.NODE_ENV === "development" ||
        process.env.DEMO_MODE === "true";

      if (isDemoMode) {
        console.warn(
          "Failed to post comment, returning demo response for testing",
        );
        // Return a demo comment - ensure parentId is properly set as a number or null
        const finalParentId = parentId != null ? Number(parentId) : null;
        const comment = {
          id: Math.floor(Math.random() * 10000) + 100,
          content: content.trim(),
          createdAt: new Date().toISOString(),
          author: "Anonymous",
          confessionId,
          parentId: finalParentId,
          _demo: true,
        };
        return new Response(JSON.stringify(comment), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
            "X-Demo-Mode": "true",
            "x-request-id": correlationId,
          },
        });
      }

      const err = await response.json().catch(() => ({} as { message?: string }));
      return createApiErrorResponse(err, {
        status: response.status,
          upstreamResponse: response,
        fallbackMessage: "Failed to post comment",
        correlationId,
        route: "POST /api/comments/[confessionId]"
      });
    }

    const data = await response.json();
    const comment = {
      id: data.id,
      content: data.content,
      createdAt: data.createdAt ?? data.created_at,
      author: "Anonymous",
      confessionId: data.confessionId ?? confessionId,
      parentId: data.parentId ?? data.parent_id ?? null,
    };

    return new Response(JSON.stringify(comment), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "x-request-id": correlationId,
      },
    });
  } catch (error) {
    const isDemoMode =
      process.env.NODE_ENV === "development" ||
      process.env.DEMO_MODE === "true";

    if (isDemoMode) {
      console.warn("Backend unreachable, returning demo comment for testing");

      const { confessionId } = await context.params.catch(() => ({ confessionId: "unknown" }));
      // Use the body that was already read at the top
      const finalParentId = parentId != null ? Number(parentId) : null;

      const comment = {
        id: Math.floor(Math.random() * 10000) + 100,
        content: content || "Demo comment",
        createdAt: new Date().toISOString(),
        author: "Anonymous",
        confessionId,
        parentId: finalParentId,
        _demo: true,
      };

      return new Response(JSON.stringify(comment), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "X-Demo-Mode": "true",
          ...(correlationId ? { "X-Correlation-ID": correlationId } : {}),
        },
      });
    }

    return createApiErrorResponse(error, {
      status: 500,
      correlationId: correlationId || undefined,
      route: "POST /api/comments/[confessionId]"
    });
  }
}

export const { GET, PUT, PATCH, DELETE } = methodNotAllowedHandlers(["POST"]);