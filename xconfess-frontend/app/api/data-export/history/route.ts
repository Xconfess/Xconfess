import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiBaseUrl } from "@/app/lib/config";

const SESSION_COOKIE_NAME = "xconfess_session";

/**
 * GET /api/data-export/history
 * Server-side proxy — browser-facing code must call this route, never the backend directly.
 */
export async function GET(_req: NextRequest) {
  const BASE_API_URL = getApiBaseUrl();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const response = await fetch(`${BASE_API_URL}/data-export/history`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: "Backend service unreachable" },
      { status: 503 },
    );
  }
}
