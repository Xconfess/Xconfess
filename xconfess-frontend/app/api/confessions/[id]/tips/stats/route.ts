import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiBaseUrl } from "@/app/lib/config";

const SESSION_COOKIE_NAME = "xconfess_session";

/**
 * GET /api/confessions/[id]/tips/stats
 * Server-side proxy for tip statistics.
 * Browser-facing code must call this route, never the backend directly.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const BASE_API_URL = getApiBaseUrl();
  const { id } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(
      `${BASE_API_URL}/confessions/${id}/tips/stats`,
      {
        method: "GET",
        headers,
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
