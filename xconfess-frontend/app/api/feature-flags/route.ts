import { NextRequest, NextResponse } from "next/server";
import { resolveBackendRoute } from "@/app/lib/api/proxy";

export async function GET(request: NextRequest) {
  try {
    const backend = resolveBackendRoute(request, "/feature-flags");
    const res = await fetch(backend.url, {
      headers: {
        Cookie: request.headers.get("cookie") || "",
      },
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch flags" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backend = resolveBackendRoute(request, "/feature-flags");
    const res = await fetch(backend.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to create flag" },
      { status: 500 },
    );
  }
}
