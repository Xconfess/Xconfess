import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const url = new URL(`${BACKEND_URL}/confessions/search`);
    searchParams.forEach((value, key) => {
      url.searchParams.append(key, value);
    });

    const res = await fetch(url.toString(), {
      headers: {
        Cookie: request.headers.get("cookie") || "",
      },
    });

    if (!res.ok) {
      if (res.status === 429) {
        const errBody = await res.json().catch(() => ({}));
        const retryAfter = typeof errBody.retryAfter === 'number'
          ? errBody.retryAfter
          : parseInt(res.headers.get('retry-after') ?? '60', 10);
        return NextResponse.json(
          {
            statusCode: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            message: errBody.message ?? 'Too many requests. Please slow down.',
            retryAfter,
            requestId: errBody.requestId ?? res.headers.get('x-request-id') ?? '',
            timestamp: errBody.timestamp ?? new Date().toISOString(),
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
              'Content-Type': 'application/json',
            },
          }
        );
      }
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}
