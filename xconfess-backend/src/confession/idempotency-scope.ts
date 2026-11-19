import * as crypto from 'crypto';

/**
 * Idempotency keys are scoped to a (session, operation) pair so that two
 * unrelated clients that happen to generate the same opaque key never collide,
 * and so the same key can be safely reused across different operations
 * (Issue #2116).
 */
export interface IdempotencyScope {
  /** Logical operation, e.g. `POST /confessions`. */
  operation: string;
  /** Stable identifier for the caller's session/actor. */
  sessionId: string;
}

/** The single operation that currently supports idempotency. */
export const DEFAULT_IDEMPOTENCY_OPERATION = 'POST /confessions';

/** Session bucket used when the request carries no actor fingerprint. */
export const ANONYMOUS_SESSION_ID = 'anonymous';

export const DEFAULT_IDEMPOTENCY_SCOPE: IdempotencyScope = {
  operation: DEFAULT_IDEMPOTENCY_OPERATION,
  sessionId: ANONYMOUS_SESSION_ID,
};

/**
 * Minimal structural view of an inbound request. Kept hand-rolled (instead of
 * importing Express' `Request`) so the scope logic stays trivially unit
 * testable and free of framework coupling.
 */
export interface IdempotencyRequestLike {
  user?: { id?: string | number | null; sub?: string | number | null } | null;
  anonymousContextId?: string | null;
  headers?: Record<string, unknown> | null;
  cookies?: Record<string, unknown> | null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (str.length > 0) return str;
  }
  return null;
}

function header(
  req: IdempotencyRequestLike | undefined,
  name: string,
): string | null {
  const headers = req?.headers;
  if (!headers) return null;
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) return firstString(direct[0]);
  return firstString(direct);
}

function cookie(
  req: IdempotencyRequestLike | undefined,
  name: string,
): string | null {
  return firstString(req?.cookies?.[name]);
}

/**
 * Resolve a stable session identifier for the request.
 *
 * Precedence (most stable first):
 *   1. Authenticated user id           → `user:<id>`
 *   2. Anonymous-context fingerprint   → `anon:<contextId>`
 *   3. Client-supplied anon id header  → `anon-header:<id>`
 *   4. CSRF token                      → `csrf:<token>`
 *   5. Fallback                        → `anonymous`
 */
export function resolveIdempotencySessionId(
  req: IdempotencyRequestLike | undefined,
): string {
  const userId = firstString(req?.user?.id, req?.user?.sub);
  if (userId) return `user:${userId}`;

  const anonymousContextId = firstString(req?.anonymousContextId);
  if (anonymousContextId) {
    return `anon:${anonymousContextId}`;
  }

  const anonHeader = header(req, 'x-anonymous-user-id');
  if (anonHeader) return `anon-header:${anonHeader}`;

  const csrf = firstString(
    cookie(req, 'csrf-token'),
    cookie(req, 'csrfToken'),
    header(req, 'x-csrf-token'),
  );
  if (csrf) return `csrf:${csrf}`;

  return ANONYMOUS_SESSION_ID;
}

/** Build the scope for a confession-creation request. */
export function buildIdempotencyScope(
  req: IdempotencyRequestLike | undefined,
  operation: string = DEFAULT_IDEMPOTENCY_OPERATION,
): IdempotencyScope {
  return { operation, sessionId: resolveIdempotencySessionId(req) };
}

/**
 * Derive the value actually persisted as the idempotency key.
 *
 * The result is a 64-char lowercase hex SHA-256 digest, which is exactly the
 * width of `confessions.idempotency_key` (varchar(64)) and well within the
 * `confession_idempotency_records.idempotency_key` column (varchar(255)).
 * Because it is a hash, the raw client key never has to be trusted as a
 * database identifier.
 */
export function computeScopedIdempotencyKey(
  clientKey: string,
  scope?: IdempotencyScope,
): string {
  const effective = scope ?? DEFAULT_IDEMPOTENCY_SCOPE;
  return crypto
    .createHash('sha256')
    .update(
      `${effective.operation}\u0000${effective.sessionId}\u0000${clientKey}`,
      'utf8',
    )
    .digest('hex');
}
