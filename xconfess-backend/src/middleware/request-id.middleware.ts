import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware that attaches a unique request ID to every incoming request.
 *
 * Behavior:
 * - If the client sends an `x-request-id` header, that value is honored.
 * - Otherwise a new UUID v4 is generated.
 * - The ID is stored on `req['requestId']` for downstream consumers.
 * - The ID is echoed back in the `x-request-id` response header so
 *   clients can reference it in support/debugging requests.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingId = req.headers['x-request-id'];
    const requestId: string =
      typeof incomingId === 'string' && incomingId.trim().length > 0
        ? incomingId.trim()
        : uuidv4();

    // Attach to request object for downstream use
    (req as any).requestId = requestId;

    // Echo back in response headers
    res.setHeader('x-request-id', requestId);

    next();
  }
}
