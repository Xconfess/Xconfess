/**
 * Telemetry redaction (Issue #2281).
 *
 * Anything sent to a third-party telemetry endpoint (currently the
 * `NEXT_PUBLIC_ERROR_TRACKING_URL` error beacon) must not carry generated
 * identity identifiers: anonymous user IDs, anonymous context IDs, user IDs,
 * session/device IDs or wallet addresses. This module scrubs them from:
 *
 *  - object keys that name an identifier (value replaced with REDACTED)
 *  - URL query parameters that name an identifier
 *  - URL path segments that carry an identifier (e.g. /messages/keys/:id)
 *
 * Deliberately kept (see docs/analytics-identity-redaction.md):
 *  - correlationId / requestId: random per request, not tied to an identity
 *  - confession / comment IDs: public content IDs already visible in URLs
 */

export const REDACTED = "[redacted]";

const MAX_DEPTH = 6;

/** Normalised (lowercase, alphanumerics only) fragments of identity keys. */
const IDENTITY_KEY_FRAGMENTS = [
  "anonymoususerid",
  "anonymouscontextid",
  "anonid",
  "userid",
  "actorid",
  "senderid",
  "recipientid",
  "sessionid",
  "deviceid",
  "walletaddress",
  "stellaraddress",
  "publickey",
  "email",
  "authorization",
  "token",
  "password",
  "cookie",
];

const IDENTITY_QUERY_PARAM =
  /([?&])(anonymous_?user_?id|anonymous_?context_?id|anon_?id|user_?id|actor_?id|session_?id|device_?id|wallet_?address|public_?key|email|token)=([^&#\s"']*)/gi;

/** Routes whose next path segment is always an identity identifier. */
const IDENTITY_PATH_ALWAYS = /(\/messages\/keys\/)([^/?#\s"']+)/gi;

/** Routes whose next path segment is an identifier when it looks like an ID. */
const IDENTITY_PATH_ID_LIKE =
  /(\/(?:users?|anonymous(?:-users?)?|sessions?|wallets?)\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z0-9_-]{16,})(?=[/?#\s"']|$)/gi;

/** `anon:<id>` / `user:<id>` actor strings. */
const PREFIXED_ACTOR = /\b(anon|user):(?!p1_)[A-Za-z0-9_-]+/g;

export function isIdentityKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return IDENTITY_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function redactTelemetryString(value: string): string {
  return value
    .replace(IDENTITY_QUERY_PARAM, (_m, sep, name) => `${sep}${name}=${REDACTED}`)
    .replace(IDENTITY_PATH_ALWAYS, (_m, prefix) => `${prefix}${REDACTED}`)
    .replace(IDENTITY_PATH_ID_LIKE, (_m, prefix) => `${prefix}${REDACTED}`)
    .replace(PREFIXED_ACTOR, (_m, ns) => `${ns}:${REDACTED}`);
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return redactTelemetryString(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (depth >= MAX_DEPTH || seen.has(value)) {
    return "[truncated]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isIdentityKey(key) ? REDACTED : redactValue(child, depth + 1, seen);
  }
  return result;
}

/**
 * Return a deep copy of `payload` with identity identifiers removed.
 * Never mutates the input.
 */
export function redactTelemetryPayload<T extends Record<string, unknown>>(
  payload: T,
): Record<string, unknown> {
  return redactValue(payload, 0, new WeakSet()) as Record<string, unknown>;
}
