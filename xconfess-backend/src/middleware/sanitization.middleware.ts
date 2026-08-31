import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import sanitizeHtml from 'sanitize-html';

const CONFESSION_ALLOWED_TAGS = [
  'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
];

const CONFESSION_ALLOWED_ATTRS: sanitizeHtml.IOptions['allowedAttributes'] = {};

const CONFESSION_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: CONFESSION_ALLOWED_TAGS,
  allowedAttributes: CONFESSION_ALLOWED_ATTRS,
  disallowedTagsMode: 'discard',
};

const PLAIN_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

type RouteContext = 'confession' | 'comment' | 'search' | 'username' | 'generic';

function detectContext(path: string): RouteContext {
  if (path.includes('/confessions')) return 'confession';
  if (path.includes('/comments')) return 'comment';
  if (path.includes('/search')) return 'search';
  if (path.includes('/auth/register') || path.includes('/users')) return 'username';
  return 'generic';
}

function sanitizeForConfession(value: string): string {
  return sanitizeHtml(value, CONFESSION_OPTIONS).trim();
}

function sanitizeForPlainText(value: string): string {
  return sanitizeHtml(value, PLAIN_TEXT_OPTIONS).trim();
}

/**
 * Sanitizes a search query string.
 *
 * Strips HTML tags first, then escapes SQL/regex wildcard characters (`%`, `_`, `\`)
 * so that user input cannot expand into unintended LIKE patterns or path traversals.
 */
function sanitizeForSearch(value: string): string {
  const stripped = sanitizeHtml(value, PLAIN_TEXT_OPTIONS);
  return stripped.replace(/[%_\\]/g, '\\$&').trim();
}

function sanitizeGeneric(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
}

function sanitizeValue(value: string, context: RouteContext): string {
  switch (context) {
    case 'confession':
      return sanitizeForConfession(value);
    case 'comment':
      return sanitizeForPlainText(value);
    case 'search':
      return sanitizeForSearch(value);
    case 'username':
      // Username format is enforced by DTO regex; just strip any HTML/scripts
      return sanitizeForPlainText(value);
    default:
      return sanitizeGeneric(value);
  }
}

function sanitizeObject(
  obj: Record<string, unknown>,
  context: RouteContext,
  logger: Logger,
  path: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(obj)) {
    const val = obj[key];

    if (typeof val === 'string') {
      const sanitized = sanitizeValue(val, context);
      if (sanitized !== val) {
        logger.warn(
          `[XSS] Sanitized field "${key}" on ${path} — context=${context} ` +
            `original_length=${val.length} sanitized_length=${sanitized.length}`,
          'SanitizationMiddleware',
        );
      }
      result[key] = sanitized;
    } else if (Array.isArray(val)) {
      result[key] = val.map((item) =>
        typeof item === 'string'
          ? sanitizeValue(item, context)
          : typeof item === 'object' && item !== null
          ? sanitizeObject(item as Record<string, unknown>, context, logger, path)
          : item,
      );
    } else if (typeof val === 'object' && val !== null) {
      result[key] = sanitizeObject(val as Record<string, unknown>, context, logger, path);
    } else {
      result[key] = val;
    }
  }

  return result;
}

@Injectable()
export class SanitizationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SanitizationMiddleware.name);

  use(req: Request, _res: Response, next: NextFunction): void {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      const context = detectContext(req.path);
      req.body = sanitizeObject(req.body, context, this.logger, req.path);
    }

    if (req.query && typeof req.query === 'object') {
      const context = req.path.includes('/search') ? 'search' : 'generic';
      const sanitizedQuery: Record<string, unknown> = {};

      for (const key of Object.keys(req.query)) {
        const val = req.query[key];
        if (typeof val === 'string') {
          sanitizedQuery[key] = sanitizeValue(val, context);
        } else if (Array.isArray(val)) {
          sanitizedQuery[key] = val.map((v) =>
            typeof v === 'string' ? sanitizeValue(v, context) : v,
          );
        } else {
          sanitizedQuery[key] = val;
        }
      }

      Object.defineProperty(req, 'query', {
        value: sanitizedQuery,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    next();
  }
}
