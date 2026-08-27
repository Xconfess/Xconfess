import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/app/lib/config";

/**
 * ASSUMPTION: see app/api/confessions/drafts/route.ts — same proxy
 * pattern, scoped to a single draft id.
 */

type RouteContext = { params: Promise<{ id: string }> };

function forwardAuth(req: NextRequest): HeadersInit {
  const auth = req.headers.get("authorization");
  return auth ? { Authorization: auth } : {};
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const BACKEND_URL = getApiBaseUrl();
  const { id } = await params;
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND_URL}/confessions/drafts/${id}`, {
      method: "PATCH",
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

export async function POST(req: NextRequest, { params }: RouteContext) {
  const BACKEND_URL = getApiBaseUrl();
  const { id } = await params;
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const res = await fetch(
      `${BACKEND_URL}/confessions/drafts/${id}/autosave`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...forwardAuth(req),
        },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { message: "Draft service unavailable" },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const BACKEND_URL = getApiBaseUrl();
  const { id } = await params;
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/confessions/drafts/${id}`, {
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
