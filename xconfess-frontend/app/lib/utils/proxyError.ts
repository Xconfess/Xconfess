/**
 * Centralized error-shaping helpers for App Router proxy routes.
 *
 * Every proxy handler should use these instead of building its own
 * `new Response(JSON.stringify(...))` blocks and ad-hoc `console.error` calls.
 *
 * Design goals
 * ────────────
 *  • Stable JSON body shape: { message, correlationId?, backendStatus? }
 *  • Structured log prefix:  [METHOD /path] <label> status=N (CID: id)
 *  • `correlationId` is forwarded only when it is a real value – the
 *    sentinel string "unknown" is stripped so clients don't see noise.
 *  • Named factories cover every recurring failure scenario so call-sites
 *    read like documentation rather than inline error-construction logic.
 */
// ─── Constants ────────────────────────────────────────────────────────────────

const JSON_CONTENT_TYPE = { "Content-Type": "application/json" } as const;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Contextual tags that travel with every log line and error body.
 *
 * @example
 * const ctx: ProxyErrorContext = {
 *   route: "GET /api/confessions",
 *   correlationId: request.headers.get("X-Correlation-ID") ?? undefined,
 * };
 */
export interface ProxyErrorContext {
  /**
   * Human-readable route label used as the log prefix.
   * Recommended format: `"METHOD /api/path"`, e.g. `"GET /api/confessions"`.
   */
  route: string;

  /**
   * Correlation ID forwarded from the client's `X-Correlation-ID` header.
   * The sentinel value `"unknown"` is treated as absent and will be omitted
   * from both log lines and response bodies.
   */
  correlationId?: string;

  /**
   * HTTP status code returned by the upstream backend, when a response was
   * received. Included in the response body so clients can distinguish
   * "backend said 422" from "proxy said 422".
   */
  backendStatus?: number;
}

/**
 * Stable JSON shape emitted by every proxy error response.
 * Consumers can rely on `message` always being present.
 */
export interface ProxyErrorBody {
  message: string;
  /** Present only when the request carried a real correlation ID. */
  correlationId?: string;
  /** Present only when the upstream backend returned an HTTP response. */
  backendStatus?: number;
}

// ─── Internal utilities ───────────────────────────────────────────────────────

/**
 * Returns the correlation ID if it is a genuine value, or `undefined` when it
 * is absent or equal to the "unknown" sentinel used by several route handlers.
 */
function resolveCorrelationId(id: string | undefined): string | undefined {
  if (!id || id === "unknown") return undefined;
  return id;
}

// ─── Core primitive: response builder ─────────────────────────────────────────

/**
 * Build a `Response` with a consistent JSON error body and the
 * `Content-Type: application/json` header.
 *
 * Fields are only included in the body when they carry meaningful data:
 *  – `correlationId` is omitted when absent or `"unknown"`.
 *  – `backendStatus` is omitted when not provided.
 *
 * @param message     Human-readable error description forwarded to the client.
 * @param httpStatus  The HTTP status code of the *proxy* response.
 * @param ctx         Optional contextual tags to embed in the body.
 */
export function buildProxyErrorResponse(
  message: string,
  httpStatus: number,
  ctx: Partial<Pick<ProxyErrorContext, "correlationId" | "backendStatus">> = {},
): Response {
  const body: ProxyErrorBody = { message };
  const correlationId = resolveCorrelationId(ctx.correlationId);

  if (correlationId) {
    body.correlationId = correlationId;
  }
  if (ctx.backendStatus !== undefined) {
    body.backendStatus = ctx.backendStatus;
  }

  return new Response(JSON.stringify(body), {
    status: httpStatus,
    headers: JSON_CONTENT_TYPE,
  });
}

// ─── Core primitive: structured logger ────────────────────────────────────────

/**
 * Emit a structured `console.error` line with a consistent prefix.
 *
 * Log format (all optional segments are only appended when present):
 * ```
 * [GET /api/confessions] Backend error status=502 (CID: abc-123) <cause?>
 * ```
 *
 * @param label Short description of the failure, e.g. `"Backend error"`.
 * @param ctx   Contextual tags used to build the log prefix.
 * @param cause Optional original error or message to append as a second
 *              argument so the JS console renders it as an expandable object.
 */
export function logProxyError(
  label: string,
  ctx: Partial<ProxyErrorContext>,
  cause?: unknown,
): void {
  const cid = resolveCorrelationId(ctx.correlationId);
  const cidSegment = cid ? ` (CID: ${cid})` : "";
  const statusSegment =
    ctx.backendStatus !== undefined ? ` status=${ctx.backendStatus}` : "";
  const prefix = ctx.route
    ? `[${ctx.route}] ${label}${statusSegment}${cidSegment}`
    : `${label}${statusSegment}${cidSegment}`;

  if (cause !== undefined) {
    console.error(prefix, cause);
  } else {
    console.error(prefix);
  }
}

// ─── Named scenario factories ──────────────────────────────────────────────────

/**
 * **503 – Missing `BACKEND_API_URL`.**
 *
 * Returns a pre-built response for when the required environment variable has
 * not been set. Does *not* log – configuration errors are expected to surface
 * at application startup, not on every request.
 *
 * @example
 * if (!process.env.BACKEND_API_URL) return misconfiguredBackendResponse();
 */
export function misconfiguredBackendResponse(): Response {
  return buildProxyErrorResponse(
    "Server misconfiguration: BACKEND_API_URL is not set. Contact the system administrator.",
    503,
  );
}

/**
 * **Mirrors backend status – non-2xx upstream response.**
 *
 * Logs the failure with the backend's status code and returns a response that
 * mirrors that status so the client can react appropriately (e.g. show a 404
 * page when the upstream says 404, surface a 429 when rate-limited).
 *
 * The `backendStatus` is embedded in both the log line and the response body
 * so it is always preserved, even when the proxy remaps the HTTP status.
 *
 * @param backendMessage  `message` extracted from the backend error payload.
 *                        When absent or empty, `fallbackMessage` is used.
 * @param backendStatus   HTTP status returned by the upstream backend.
 * @param fallbackMessage Client-facing message when the backend body is empty.
 * @param ctx             Route context for logging and body enrichment.
 *
 * @example
 * const errorData = await res.json().catch(() => ({}));
 * return backendHttpErrorResponse(
 *   errorData.message,
 *   res.status,
 *   `Failed to create confession: ${res.statusText}`,
 *   { route: "POST /api/confessions", correlationId },
 * );
 */
export function backendHttpErrorResponse(
  backendMessage: string | undefined,
  backendStatus: number,
  fallbackMessage: string,
  ctx: ProxyErrorContext,
): Response {
  const message = backendMessage || fallbackMessage;
  const enriched: ProxyErrorContext = { ...ctx, backendStatus };
  logProxyError("Backend error", enriched);
  return buildProxyErrorResponse(message, backendStatus, enriched);
}

/**
 * **503 – Backend unreachable (network / fetch error).**
 *
 * Use this in `catch` blocks that surround a `fetch()` call to the upstream.
 * Logs the underlying cause for server-side diagnostics and returns a generic
 * "service unavailable" message to the client so internal details are not
 * leaked.
 *
 * @param ctx   Route context for logging and body enrichment.
 * @param cause The caught error, forwarded to `console.error` as a second
 *              argument so it remains inspectable in the server logs.
 *
 * @example
 * try {
 *   const res = await fetch(backendUrl, ...);
 * } catch (fetchError) {
 *   return backendUnreachableResponse(ctx, fetchError);
 * }
 */
export function backendUnreachableResponse(
  ctx: ProxyErrorContext,
  cause: unknown,
): Response {
  logProxyError("Failed to reach backend", ctx, cause);
  return buildProxyErrorResponse(
    "Backend service unavailable. Please try again later.",
    503,
    ctx,
  );
}

/**
 * **500 – Unexpected internal error inside a proxy handler.**
 *
 * Use this in the outermost `catch` block of a route handler for exceptions
 * that are not network failures or backend errors – e.g. JSON parse failures,
 * programming bugs, or unanticipated runtime exceptions.
 *
 * When `cause` is an `Error` instance its `message` is used directly;
 * otherwise a generic `"Internal server error"` is returned to the client.
 *
 * @param ctx   Route context for logging and body enrichment.
 * @param cause The caught value.
 *
 * @example
 * } catch (error) {
 *   return internalProxyErrorResponse(
 *     { route: "POST /api/confessions", correlationId },
 *     error,
 *   );
 * }
 */
export function internalProxyErrorResponse(
  ctx: ProxyErrorContext,
  cause: unknown,
): Response {
  const message =
    cause instanceof Error ? cause.message : "Internal server error";
  logProxyError("Internal error", ctx, cause);
  return buildProxyErrorResponse(message, 500, ctx);
}
