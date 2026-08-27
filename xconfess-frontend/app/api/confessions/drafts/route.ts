import { NextRequest, NextResponse } from "next/server";

/**
 * ASSUMPTION: real backend lives at BACKEND_URL (env var) and exposes
 * /confessions/drafts with the same shape described in
 * app/lib/api/drafts.ts. This route is a thin authenticated proxy —
 * swap BACKEND_URL or this implementation once the real service exists,
 * with no changes required in the frontend client or DraftManager.
 */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

function forwardAuth(req: NextRequest): HeadersInit {
  const auth = req.headers.get("authorization");
  return auth ? { Authorization: auth } : {};
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/confessions/drafts`, {
      headers: forwardAuth(req),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { message: "Draft service unavailable" },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND_URL}/confessions/drafts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...forwardAuth(req),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { message: "Draft service unavailable" },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/confessions/drafts`, {
      method: "DELETE",
      headers: forwardAuth(req),
    });
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { message: "Draft service unavailable" },
      { status: 502 },
    );
  }
}