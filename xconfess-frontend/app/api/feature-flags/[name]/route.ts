import { NextRequest, NextResponse } from "next/server";
import { resolveBackendRoute } from "@/app/lib/api/proxy";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const body = await request.json();

    const backend = resolveBackendRoute(request, `/feature-flags/${name}`);
    const res = await fetch(backend.url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update flag" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;

    const backend = resolveBackendRoute(request, `/feature-flags/${name}`);
    const res = await fetch(backend.url, {
      method: "DELETE",
      headers: {
        Cookie: request.headers.get("cookie") || "",
      },
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete flag" },
      { status: 500 },
    );
  }
}
