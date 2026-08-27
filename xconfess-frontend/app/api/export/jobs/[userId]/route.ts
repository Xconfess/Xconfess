import { NextRequest, NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/app/lib/config';

type RouteContext = { params: Promise<{ userId: string }> };

/**
 * Proxy route: GET /api/export/jobs/[userId]
 *
 * Defense-in-depth layer 1 (proxy):
 *  - Validates session cookie exists.
 *  - Ensures the userId in the URL matches the session's userId.
 *  - Strips any caller-supplied X-User-Id header before forwarding (prevents spoofing).
 *
 * Defense-in-depth layer 2 (backend NestJS):
 *  - OwnershipGuard re-validates independently from the JWT.
 *
 * Even if one layer is bypassed the other will reject the request.
 */
export async function GET(
  req: NextRequest,
  { params }: RouteContext,
) {
  const BACKEND_URL = getApiBaseUrl();
  const { userId } = await params;

  // ── Proxy-layer auth ────────────────────────────────────────────────────────
  const sessionUserId = getSessionUserId(req);
  if (!sessionUserId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  if (sessionUserId !== userId) {
    // IDOR attempt caught at the proxy layer.
    console.warn(`[proxy/export] IDOR attempt: session=${sessionUserId} param=${userId}`);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Forward to backend ─────────────────────────────────────────────────────
  const backendRes = await fetch(`${BACKEND_URL}/export/jobs/${userId}`, {
    headers: buildForwardHeaders(req),
  });

  const data = await backendRes.json();
  return NextResponse.json(data, { status: backendRes.status });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getSessionUserId(req: NextRequest): string | null {
  // In production this would decode the session cookie (e.g. iron-session / jose).
  // Returning null here causes a 401 rather than trusting an absent session.
  const sessionCookie = req.cookies.get('session');
  if (!sessionCookie) return null;

  try {
    // Replace with your actual session decoding logic.
    const payload = JSON.parse(
      Buffer.from(sessionCookie.value.split('.')[1], 'base64').toString(),
    );
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}

function buildForwardHeaders(req: NextRequest): HeadersInit {
  const headers: Record<string, string> = {
    // Forward the cookie so NestJS JwtAuthGuard / session guard can also validate.
    cookie: req.headers.get('cookie') ?? '',
    'content-type': 'application/json',
  };

  // Explicitly strip any caller-injected X-User-Id or X-Forwarded-User.
  // The backend must never trust these headers for authorization.
  // (listed here for documentation clarity — fetch() won't forward them
  //  unless we copy them, but being explicit is safer.)
  const blockedHeaders = ['x-user-id', 'x-forwarded-user', 'x-admin-override'];
  for (const h of blockedHeaders) {
    delete headers[h];
  }

  return headers;
}
