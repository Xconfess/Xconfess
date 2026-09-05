import { NextRequest, NextResponse } from "next/server";
import { resolveBackendRoute } from "@/app/lib/api/proxy";

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
    const backend = resolveBackendRoute(req, "/confessions/drafts");
    const res = await fetch(backend.url, {
      headers: forwardAuth(req),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
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
    const backend = resolveBackendRoute(req, "/confessions/drafts");
    const res = await fetch(backend.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...forwardAuth(req),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
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
    const backend = resolveBackendRoute(req, "/confessions/drafts");
    const res = await fetch(backend.url, {
      method: "DELETE",
      headers: forwardAuth(req),
    });
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: "Draft service unavailable" },
      { status: 502 },
    );
  }
}
