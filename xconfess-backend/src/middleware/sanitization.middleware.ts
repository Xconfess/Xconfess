import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  sanitizeConfession,
  sanitizePlainText,
  sanitizeSearchQuery,
} from '../utils/sanitize.utils';

export type RouteContext =
  | 'confession'
  | 'comment'
  | 'messages'
  | 'reports'
  | 'search'
  | 'username'
  | 'generic';

export function detectContext(path: string): RouteContext {
  if (path.includes('/confessions')) return 'confession';
  if (path.includes('/messages')) return 'messages';
  if (path.includes('/comments')) return 'comment';
  if (path.includes('/reports') || path.includes('/report')) return 'reports';
  if (path.includes('/search')) return 'search';
  if (path.includes('/auth/register') || path.includes('/users')) return 'username';
  return 'generic';
}

export function sanitizeValue(value: string, context: RouteContext): string {
  switch (context) {
    case 'confession':
    case 'messages':
      return sanitizeConfession(value);
    case 'comment':
    case 'reports':
    case 'username':
      return sanitizePlainText(value);
    case 'search':
      return sanitizeSearchQuery(value);
    default:
      return sanitizePlainText(value);
  }
}

export function sanitizeObject(
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

      req.query = sanitizedQuery as typeof req.query;
    }

    next();
  }
}
