import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { redactLogPayload } from './log-redaction';

/**
 * Structured fields emitted for every completed HTTP request.
 *
 * These fields satisfy the acceptance criteria:
 *   – route, status, requestId, user scope, subsystem, and error class
 *     are always present.
 */
interface StructuredRequestLog {
  /** HTTP method (GET, POST, …) */
  method: string;
  /** Route path (e.g. /api/confessions) */
  route: string;
  /** HTTP status code */
  status: number;
  /** Request duration in milliseconds */
  duration: number;
  /** Correlation / request ID for cross-service tracing */
  requestId: string;
  /** Masked user ID or 'anonymous' when unauthenticated */
  userId: string;
  /** User role or 'anonymous' */
  userRole: string;
  /** Module that handled the request (inferred from controller) */
  subsystem: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Error class when status >= 500, omitted otherwise */
  errorClass?: string;
  /** Error message when status >= 500, omitted otherwise */
  errorMessage?: string;
  /** IP address of the caller */
  ip: string;
}

@Injectable()
export class StructuredLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = Date.now();

    const method = req.method;
    const route = req.url;
    const requestId =
      (req as any).requestId ?? res.getHeader('x-request-id') ?? 'unknown';

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const status = res.statusCode;
          const log = this.buildLog(method, route, status, duration, requestId, req);

          if (status >= 500) {
            this.logger.error(JSON.stringify(redactLogPayload(log)));
          } else if (status >= 400) {
            this.logger.warn(JSON.stringify(redactLogPayload(log)));
          } else {
            this.logger.log(JSON.stringify(redactLogPayload(log)));
          }
        },
        error: (err: unknown) => {
          const duration = Date.now() - start;
          const status = res.statusCode || 500;
          const log = this.buildLog(method, route, status, duration, requestId, req);

          if (err instanceof Error) {
            log.errorClass = err.constructor.name;
            log.errorMessage = err.message;
          } else {
            log.errorClass = 'UnknownError';
            log.errorMessage = String(err);
          }

          this.logger.error(JSON.stringify(redactLogPayload(log)));
        },
      }),
    );
  }

  private buildLog(
    method: string,
    route: string,
    status: number,
    duration: number,
    requestId: string,
    req: Request,
  ): StructuredRequestLog {
    const user = (req as any).user;
    const userId = user?.id ? `user_${user.id}` : 'anonymous';
    const userRole = user?.role ?? 'anonymous';

    // Infer subsystem from route
    const subsystem = this.inferSubsystem(route);

    return {
      method,
      route,
      status,
      duration,
      requestId,
      userId,
      userRole,
      subsystem,
      timestamp: new Date().toISOString(),
      ip: req.ip ?? 'unknown',
    };
  }

  private inferSubsystem(route: string): string {
    if (route.includes('/auth')) return 'auth';
    if (route.includes('/confession')) return 'confession';
    if (route.includes('/comment')) return 'comment';
    if (route.includes('/reaction')) return 'reaction';
    if (route.includes('/message')) return 'message';
    if (route.includes('/admin')) return 'admin';
    if (route.includes('/health')) return 'health';
    if (route.includes('/search')) return 'search';
    if (route.includes('/analytics')) return 'analytics';
    if (route.includes('/stellar')) return 'stellar';
    if (route.includes('/tipping')) return 'tipping';
    if (route.includes('/report')) return 'report';
    if (route.includes('/notification')) return 'notification';
    if (route.includes('/export')) return 'export';
    if (route.includes('/bookmark')) return 'bookmark';
    return 'app';
  }
}
