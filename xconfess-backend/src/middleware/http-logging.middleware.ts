import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AppLogger } from '../logger/logger.service';

/**
 * Middleware that logs every HTTP request with structured fields.
 *
 * Includes method, route, status code, duration, and the request ID
 * for correlation. Excludes passwords, tokens, wallet secrets,
 * confession bodies, and private message content (#1978).
 */
@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  constructor(private readonly appLogger: AppLogger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const requestId = (req as any).requestId as string | undefined;
    const method = req.method;
    const route = req.originalUrl || req.url;
    const appLogger = this.appLogger;

    const originalEnd = res.end.bind(res);
    res.end = function (this: Response, ...args: any[]) {
      const durationMs = Date.now() - start;
      const statusCode = res.statusCode;
      const fields: Record<string, unknown> = {
        event: 'http_request',
        method,
        route,
        statusCode,
        durationMs,
      };

      if (statusCode >= 500) {
        appLogger.emitAlertEvent('http_request_error', fields, 'HttpLogger', requestId);
      } else if (statusCode >= 400) {
        appLogger.emitWarningEvent('http_request_warning', fields, 'HttpLogger', requestId);
      } else {
        appLogger.emitEvent('info', 'http_request', fields, 'HttpLogger', requestId);
      }

      return originalEnd(...args);
    } as any;

    next();
  }
}
