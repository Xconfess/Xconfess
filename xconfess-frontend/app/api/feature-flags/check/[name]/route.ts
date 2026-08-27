import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const { searchParams } = new URL(request.url);
    const override = searchParams.get("override");

    const url = new URL(`${BACKEND_URL}/feature-flags/check/${name}`);
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
