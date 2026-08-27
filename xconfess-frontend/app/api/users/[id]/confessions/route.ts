import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { getApiBaseUrl } from "@/app/lib/config";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const BASE_API_URL = getApiBaseUrl();
  const { id } = await params;
  const correlationId = req.headers.get("X-Correlation-ID") || "unknown";

  // ── Proxy-layer auth ────────────────────────────────────────────────────────
  const sessionUserId = getSessionUserId(req);
  if (!sessionUserId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (String(sessionUserId) !== String(id)) {
    console.warn(
      `[proxy/confessions] IDOR attempt blocked: session=${sessionUserId} param=${id}`,
    );
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const backendUrl = `${BASE_API_URL}/users/${id}/confessions`;

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: buildForwardHeaders(req, correlationId),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: response.status,
        upstreamResponse: response,
        correlationId,
        route: "GET /api/users/[id]/confessions",
      });
    }

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      correlationId,
      route: "GET /api/users/[id]/confessions",
    });
  }
}

function getSessionUserId(req: NextRequest): string | null {
  const sessionCookie = req.cookies.get("session");
  if (!sessionCookie) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(sessionCookie.value.split(".")[1], "base64").toString(),
    );
    return payload?.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

function buildForwardHeaders(
  req: NextRequest,
  correlationId: string,
): HeadersInit {
  const headers: Record<string, string> = {
    cookie: req.headers.get("cookie") ?? "",
    "content-type": "application/json",
    "X-Correlation-ID": correlationId,
  };

  const blockedHeaders = ["x-user-id", "x-forwarded-user", "x-admin-override"];
  for (const h of blockedHeaders) {
    delete headers[h];
  }

  return headers;
}
