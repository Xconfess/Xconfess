import { NextRequest, NextResponse } from 'next/server';
import { resolveBackendRoute } from '@/app/lib/api/proxy';

type RouteContext = { params: Promise<{ userId: string }> };

/** GET /api/dm/[userId]/inbox — proxy with IDOR check at the proxy layer */
export async function GET(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { userId } = await params;

  const sessionUserId = getSessionUserId(req);
  if (!sessionUserId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  if (sessionUserId !== userId) {
    console.warn(`[proxy/dm] IDOR attempt: session=${sessionUserId} param=${userId}`);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const backend = resolveBackendRoute(req, `/messages/${userId}/inbox`);
  const backendRes = await fetch(backend.url, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
  });

  return NextResponse.json(await backendRes.json(), { status: backendRes.status });
}

/** DELETE /api/dm/[userId]/thread/[threadId] */
export async function DELETE(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { userId } = await params;
  const threadId = req.nextUrl.searchParams.get('threadId');

  const sessionUserId = getSessionUserId(req);
  if (!sessionUserId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (sessionUserId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const backend = resolveBackendRoute(
    req,
    `/messages/${userId}/thread/${threadId}`,
  );
  const backendRes = await fetch(backend.url, {
    method: 'DELETE',
    headers: { cookie: req.headers.get('cookie') ?? '' },
  });

  return NextResponse.json(await backendRes.json(), { status: backendRes.status });
}

function getSessionUserId(req: NextRequest): string | null {
  const sessionCookie = req.cookies.get('session');
  if (!sessionCookie) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(sessionCookie.value.split('.')[1], 'base64').toString(),
    );
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}
