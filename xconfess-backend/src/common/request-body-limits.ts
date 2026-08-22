import { HttpStatus, INestApplication } from '@nestjs/common';
import { json, Request, RequestHandler, Response, urlencoded } from 'express';
import { ErrorCode } from './errors/error-codes';

/**
 * Transport-level request-body size limits for every mutating text endpoint.
 *
 * Limits are intentionally generous — they are set well above the maximum
 * payload a conforming client can ever produce (DTO MaxLength values in UTF-8
 * plus JSON envelope overhead) while still being small enough to stop memory-
 * exhaustion attacks before any application logic runs.
 *
 * Domain                 Largest DTO field   Limit
 * ─────────────────────  ──────────────────  ──────
 * Confession             1 000 chars         16 KiB
 * Comment                2 000 chars         16 KiB
 * Report                   500 chars         16 KiB
 * Confession draft       1 000 chars         16 KiB
 * Message (send/reply)   1 000 chars (body)
 *                        4 096 chars (key)   32 KiB  ← key backup can be large
 *
 * All other routes fall back to a conservative 100 KiB default.
 */
export const CONFESSION_REQUEST_MAX_BYTES = 16 * 1024; //  16 KiB
export const COMMENT_REQUEST_MAX_BYTES = 16 * 1024; //  16 KiB
export const REPORT_REQUEST_MAX_BYTES = 16 * 1024; //  16 KiB
export const DRAFT_REQUEST_MAX_BYTES = 16 * 1024; //  16 KiB
/** Message key registration can carry a 4 096-char encrypted key backup. */
export const MESSAGE_REQUEST_MAX_BYTES = 32 * 1024; //  32 KiB

const DEFAULT_REQUEST_MAX_BYTES = 100 * 1024; // 100 KiB
const REQUEST_TOO_LARGE_MESSAGE = 'Request body exceeds the allowed size';

// ── Pre-allocated parser instances ──────────────────────────────────────────
const confessionJsonParser = json({ limit: CONFESSION_REQUEST_MAX_BYTES });
const confessionUrlencodedParser = urlencoded({
  extended: true,
  limit: CONFESSION_REQUEST_MAX_BYTES,
});

const commentJsonParser = json({ limit: COMMENT_REQUEST_MAX_BYTES });
const commentUrlencodedParser = urlencoded({
  extended: true,
  limit: COMMENT_REQUEST_MAX_BYTES,
});

const reportJsonParser = json({ limit: REPORT_REQUEST_MAX_BYTES });
const reportUrlencodedParser = urlencoded({
  extended: true,
  limit: REPORT_REQUEST_MAX_BYTES,
});

const draftJsonParser = json({ limit: DRAFT_REQUEST_MAX_BYTES });
const draftUrlencodedParser = urlencoded({
  extended: true,
  limit: DRAFT_REQUEST_MAX_BYTES,
});

const messageJsonParser = json({ limit: MESSAGE_REQUEST_MAX_BYTES });
const messageUrlencodedParser = urlencoded({
  extended: true,
  limit: MESSAGE_REQUEST_MAX_BYTES,
});

const defaultJsonParser = json({ limit: DEFAULT_REQUEST_MAX_BYTES });
const defaultUrlencodedParser = urlencoded({
  extended: true,
  limit: DEFAULT_REQUEST_MAX_BYTES,
});

// ── Route matchers ───────────────────────────────────────────────────────────

type ParserPair = {
  jsonParser: RequestHandler;
  urlencodedParser: RequestHandler;
};

/**
 * POST /confessions
 * PUT  /confessions/:id
 *
 * Does NOT match /confessions/drafts or /confessions/:id/comments — those are
 * handled by more specific matchers below.
 */
function isConfessionWrite(request: Request): boolean {
  const path = request.path.replace(/^\/api/, '');

  return (
    (request.method === 'POST' && path === '/confessions') ||
    (request.method === 'PUT' && /^\/confessions\/[^/]+$/.test(path))
  );
}

/**
 * POST   /confessions/:id/comments
 * PATCH  /confessions/:id/comments/:commentId
 */
function isCommentWrite(request: Request): boolean {
  const path = request.path.replace(/^\/api/, '');

  return (
    (request.method === 'POST' &&
      /^\/confessions\/[^/]+\/comments$/.test(path)) ||
    (request.method === 'PATCH' &&
      /^\/confessions\/[^/]+\/comments\/[^/]+$/.test(path))
  );
}

/**
 * POST /confessions/:id/report
 * POST /admin/reports/:id/action
 * PATCH /admin/reports/:id/resolve
 * PATCH /admin/reports/:id/dismiss
 */
function isReportWrite(request: Request): boolean {
  const path = request.path.replace(/^\/api/, '');

  return (
    (request.method === 'POST' &&
      /^\/confessions\/[^/]+\/report$/.test(path)) ||
    ((request.method === 'POST' || request.method === 'PATCH') &&
      /^\/admin\/reports\/[^/]+\/(action|resolve|dismiss)$/.test(path)) ||
    (request.method === 'PATCH' &&
      /^\/admin\/reports\/[^/]+$/.test(path))
  );
}

/**
 * POST   /confessions/drafts
 * POST   /confessions/drafts/autosave
 * PATCH  /confessions/drafts/:id
 * POST   /confessions/drafts/:id/schedule
 * POST   /confessions/drafts/:id/cancel
 * POST   /confessions/drafts/:id/publish
 * POST   /confessions/drafts/:id/convert-to-draft
 */
function isDraftWrite(request: Request): boolean {
  const path = request.path.replace(/^\/api/, '');

  return (
    (request.method === 'POST' && /^\/confessions\/drafts/.test(path)) ||
    (request.method === 'PATCH' && /^\/confessions\/drafts\/[^/]+/.test(path))
  );
}

/**
 * POST /messages/keys          — register encryption key
 * POST /messages               — send message (future)
 * POST /messages/:id/reply     — reply to thread (future)
 */
function isMessageWrite(request: Request): boolean {
  const path = request.path.replace(/^\/api/, '');

  return (
    request.method === 'POST' &&
    /^\/messages(\/|$)/.test(path)
  );
}

function selectParsers(request: Request): ParserPair {
  // Draft check must come before confession check because draft paths
  // also start with /confessions.
  if (isDraftWrite(request)) {
    return { jsonParser: draftJsonParser, urlencodedParser: draftUrlencodedParser };
  }

  if (isConfessionWrite(request)) {
    return { jsonParser: confessionJsonParser, urlencodedParser: confessionUrlencodedParser };
  }

  if (isCommentWrite(request)) {
    return { jsonParser: commentJsonParser, urlencodedParser: commentUrlencodedParser };
  }

  if (isReportWrite(request)) {
    return { jsonParser: reportJsonParser, urlencodedParser: reportUrlencodedParser };
  }

  if (isMessageWrite(request)) {
    return { jsonParser: messageJsonParser, urlencodedParser: messageUrlencodedParser };
  }

  return { jsonParser: defaultJsonParser, urlencodedParser: defaultUrlencodedParser };
}

// ── Error helpers ────────────────────────────────────────────────────────────

function isPayloadTooLarge(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const parserError = error as { status?: number; type?: string };
  return (
    parserError.status === HttpStatus.PAYLOAD_TOO_LARGE ||
    parserError.type === 'entity.too.large'
  );
}

function sendRequestTooLarge(request: Request, response: Response): void {
  response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    code: ErrorCode.REQUEST_TOO_LARGE,
    message: REQUEST_TOO_LARGE_MESSAGE,
    timestamp: new Date().toISOString(),
    path: request.originalUrl,
    requestId:
      (request as Request & { requestId?: string }).requestId ?? 'unknown',
  });
}

// ── Middleware ───────────────────────────────────────────────────────────────

export const requestBodyParser: RequestHandler = (request, response, next) => {
  const parsers = selectParsers(request);

  parsers.jsonParser(request, response, (jsonError?: unknown) => {
    if (isPayloadTooLarge(jsonError)) {
      sendRequestTooLarge(request, response);
      return;
    }

    if (jsonError) {
      next(jsonError);
      return;
    }

    parsers.urlencodedParser(request, response, (urlencodedError?: unknown) => {
      if (isPayloadTooLarge(urlencodedError)) {
        sendRequestTooLarge(request, response);
        return;
      }

      next(urlencodedError);
    });
  });
};

/**
 * Disable Nest's built-in body parser (`bodyParser: false`) and call this
 * function during bootstrap so that targeted limits are applied before any
 * controller or validation pipe runs.
 */
export function configureRequestBodyParsing(app: INestApplication): void {
  app.use(requestBodyParser);
}
