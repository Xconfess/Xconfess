import { getApiBaseUrl } from "@/app/lib/config";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";

const BASE_API_URL = getApiBaseUrl();

function buildForwardHeaders(request: Request) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  const correlationId =
    request.headers.get("x-correlation-id") ?? crypto.randomUUID();

  headers["X-Correlation-ID"] = correlationId;
  if (authorization) headers.Authorization = authorization;
  if (cookie) headers.Cookie = cookie;

  return headers;
}

async function readJsonBody(request: Request) {
  return request.json().catch(() => ({}));
}

function safeJsonParse(text: string) {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function proxyDraftRequest(
  request: Request,
  path = "",
  init: RequestInit = {},
) {
  const correlationId =
    request.headers.get("x-correlation-id") ?? crypto.randomUUID();

  try {
    const response = await fetch(`${BASE_API_URL}/confessions/drafts${path}`, {
      ...init,
      headers: {
        ...buildForwardHeaders(request),
        ...(init.headers as Record<string, string> | undefined),
      },
      cache: "no-store",
    });

    const text = await response.text();
    const data = safeJsonParse(text);

    if (!response.ok) {
      return createApiErrorResponse(data, {
        status: response.status,
        fallbackMessage: "Failed to sync confession draft",
        correlationId,
        route: `draft-proxy ${init.method ?? "GET"} ${path || "/"}`,
      });
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 503,
      fallbackMessage: "Backend service unreachable",
      correlationId,
      route: `draft-proxy ${init.method ?? "GET"} ${path || "/"}`,
    });
  }
}

export async function readDraftPayload(request: Request) {
  const body = await readJsonBody(request);
  const content = body.content ?? body.body ?? body.message;

  if (typeof content !== "string" || content.trim().length === 0) {
    return {
      ok: false as const,
      response: createApiErrorResponse("Draft content is required", {
        status: 400,
        route: "draft-proxy payload",
      }),
    };
  }

  return {
    ok: true as const,
    body: {
      content,
      scheduledFor:
        typeof body.scheduledFor === "string" ? body.scheduledFor : undefined,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      version: typeof body.version === "number" ? body.version : undefined,
    },
  };
}
