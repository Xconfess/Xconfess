import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode } from '../errors/error-codes';

/**
 * Catch-all exception filter that handles any error not already caught by
 * {@link HttpExceptionFilter} or {@link ThrottlerExceptionFilter}.
 *
 * Ensures that every response — including unexpected runtime errors in the
 * Stellar / tipping flows — carries the active `requestId` so callers can
 * surface the correlation identifier when requesting support.
 *
 * NOTE: Register this *before* HttpExceptionFilter in `useGlobalFilters` so
 * that NestJS applies the most-specific filter first (last-registered wins
 * for matching filters, but `@Catch()` with no args is the least specific).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // Delegate HTTP exceptions to the existing HttpExceptionFilter contract —
    // only handle genuinely unexpected errors here.
    if (exception instanceof HttpException) {
      // Should never happen once the filter ordering is correct, but guard
      // defensively so we never suppress HTTP exceptions.
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      const request = ctx.getRequest<Request>();
      const status = exception.getStatus();
      const requestId = (request as any).requestId ?? 'unknown';

      response.status(status).json({
        statusCode: status,
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: exception.message,
        timestamp: new Date().toISOString(),
        path: request.path,
        requestId,
      });
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId ?? 'unknown';

    const errorClass = exception instanceof Error ? exception.constructor.name : 'UnknownError';
    // Error messages and stacks may contain request or private-message data.
    // Keep the correlation ID and error class; operators can correlate other
    // already-redacted application events with the same request ID.
    this.logger.error(
      `Unhandled exception on ${request.method} ${request.path} [requestId=${requestId}] errorClass=${errorClass}`,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: request.path,
      requestId,
    });
  }
}
