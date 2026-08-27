import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiBaseUrl } from "@/app/lib/config";

const SESSION_COOKIE_NAME = "xconfess_session";

/**
 * POST /api/confessions/[id]/tips/verify
 * Server-side proxy for tip verification.
 * Browser-facing code must call this route, never the backend directly.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const BASE_API_URL = getApiBaseUrl();
  const { id } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(
      `${BASE_API_URL}/confessions/${id}/tips/verify`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
    );

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: "Backend service unreachable" },
      { status: 503 },
    );
  }
}
