import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveBackendRoute } from "@/app/lib/api/proxy";

const SESSION_COOKIE_NAME = "xconfess_session";

/**
 * POST /api/data-export/[id]/redownload
 * Server-side proxy — browser-facing code must call this route, never the backend directly.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const backend = resolveBackendRoute(req, `/data-export/${id}/redownload`);
    const response = await fetch(
      backend.url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
