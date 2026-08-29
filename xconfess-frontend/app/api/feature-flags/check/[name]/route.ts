import { NextRequest, NextResponse } from "next/server";
import { resolveBackendRoute } from "@/app/lib/api/proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const { searchParams } = new URL(request.url);
    const override = searchParams.get("override");

    const backend = resolveBackendRoute(
      request,
      `/feature-flags/check/${name}`,
    );
    const url = new URL(backend.url);
    if (override) {
      url.searchParams.set("override", override);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Cookie: request.headers.get("cookie") || "",
      },
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { enabled: false, override: false },
      { status: 200 },
    );
  }
}
