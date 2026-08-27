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
import { AppException } from '../errors/app-exception';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    const appException = AppException.fromHttpException(exception);
    const exceptionResponse = appException.getResponse() as any;
    const requestId = (request as any).requestId || 'unknown';

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      const retryAfter = exceptionResponse.retryAfter ?? 60;
      response.setHeader('Retry-After', retryAfter.toString());
      response.setHeader('X-Request-Id', requestId);
      this.logger.warn(
        `RATE_LIMIT_EXCEEDED method=${request.method} path=${request.url} ip=${request.ip} requestId=${requestId} retryAfter=${retryAfter}`,
      );
      response.status(status).json({
        statusCode: status,
        code: exceptionResponse.code || ErrorCode.RATE_LIMIT_EXCEEDED,
        message:
          exceptionResponse.message ||
          'Too many requests. Please wait a moment and try again.',
        retryAfter,
        requestId,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
      return;
    }

    const errorResponse = {
      status,
      code: exceptionResponse.code || ErrorCode.INTERNAL_SERVER_ERROR,
      message: exceptionResponse.message || 'An unexpected error occurred',
      details: exceptionResponse.details,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} - ${status} [${errorResponse.code}]: ${errorResponse.message}`,
        exception.stack,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} [${errorResponse.code}]: ${errorResponse.message}`,
      );
    }

    response.status(status).json(errorResponse);
  }
}
