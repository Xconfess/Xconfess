import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { OperationalMetricsService } from './operational-metrics.service';
import { categorizeRoute } from './metric-labels';

/**
 * Records latency and status for every completed HTTP request.
 *
 * This is middleware (not an interceptor) on purpose: interceptors never run
 * when a guard rejects the request (401/403) or the throttler answers 429, and
 * those are exactly the responses operators want to see.
 *
 * Privacy: only the *category* returned by categorizeRoute() is used. The raw
 * URL, query string, headers, IP, user id and body are never read into a label.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: OperationalMetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();

    res.once('finish', () => {
      try {
        // Prefer the matched route template (e.g. /api/confessions/:id); fall
        // back to the pathname. categorizeRoute() only returns fixed constants.
        const matchedPath = (req as Request & { route?: { path?: unknown } })
          .route?.path;
        const path =
          typeof matchedPath === 'string'
            ? `${req.baseUrl ?? ''}${matchedPath}`
            : (req.originalUrl ?? req.url ?? '');

        this.metrics.recordHttpRequest({
          method: req.method,
          routeCategory: categorizeRoute(req.method, path),
          statusCode: res.statusCode,
          durationSeconds: Number(process.hrtime.bigint() - start) / 1e9,
        });
      } catch {
        // Metrics must never break or delay a response.
      }
    });

    next();
  }
}
