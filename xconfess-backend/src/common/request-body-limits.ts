import { HttpStatus, INestApplication } from '@nestjs/common';
import { json, Request, RequestHandler, Response, urlencoded } from 'express';
import { ErrorCode } from './errors/error-codes';

/**
 * Transport limits for confession and comment writes.
 *
 * Both APIs accept small text records. 16 KiB leaves ample room for the
 * confession DTO's 1,000-character message (including multi-byte UTF-8),
 * tags, and request metadata while rejecting unexpectedly large bodies
 * before validation, sanitization, moderation, or database work begins.
 */
export const CONFESSION_REQUEST_MAX_BYTES = 16 * 1024;
export const COMMENT_REQUEST_MAX_BYTES = 16 * 1024;

const DEFAULT_REQUEST_MAX_BYTES = 100 * 1024;
const REQUEST_TOO_LARGE_MESSAGE = 'Request body exceeds the allowed size';

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
const defaultJsonParser = json({ limit: DEFAULT_REQUEST_MAX_BYTES });
const defaultUrlencodedParser = urlencoded({
  extended: true,
  limit: DEFAULT_REQUEST_MAX_BYTES,
});

type ParserPair = {
  jsonParser: RequestHandler;
  urlencodedParser: RequestHandler;
};

function isConfessionWrite(request: Request): boolean {
  const path = request.path.replace(/^\/api/, '');

  return (
    (request.method === 'POST' && path === '/confessions') ||
    (request.method === 'PUT' && /^\/confessions\/[^/]+$/.test(path))
  );
}

function isCommentWrite(request: Request): boolean {
  const path = request.path.replace(/^\/api/, '');

  return request.method === 'POST' && /^\/comments\/[^/]+$/.test(path);
}

function selectParsers(request: Request): ParserPair {
  if (isConfessionWrite(request)) {
    return {
      jsonParser: confessionJsonParser,
      urlencodedParser: confessionUrlencodedParser,
    };
  }

  if (isCommentWrite(request)) {
    return {
      jsonParser: commentJsonParser,
      urlencodedParser: commentUrlencodedParser,
    };
  }

  return {
    jsonParser: defaultJsonParser,
    urlencodedParser: defaultUrlencodedParser,
  };
}

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
 * Nest's built-in parser must be disabled when creating the application so
 * this middleware can reject targeted writes before JSON parsing.
 */
export function configureRequestBodyParsing(app: INestApplication): void {
  app.use(requestBodyParser);
}
