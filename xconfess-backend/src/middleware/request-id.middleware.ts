import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware that attaches a unique request ID to every incoming request.
 *
 * Behavior:
 * - A client-supplied UUID v4 is honored; other values are replaced.
 * - Otherwise a new UUID v4 is generated.
 * - The ID is stored on `req['requestId']` for downstream consumers.
 * - The ID is echoed back in the `x-request-id` response header so
 *   clients can reference it in support/debugging requests.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingId = req.headers['x-request-id'];
    const normalizedIncomingId =
      typeof incomingId === 'string' ? incomingId.trim() : '';
    // UUIDs give callers a stable correlation handle without accepting
    // arbitrary high-cardinality values into logs and response headers.
    const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedIncomingId)
      ? normalizedIncomingId
      : uuidv4();

    // Attach to request object for downstream use
    (req as any).requestId = requestId;

    // Echo back in response headers
    res.setHeader('x-request-id', requestId);

    next();
  }
}
