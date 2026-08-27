import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { ErrorCode } from '../errors/error-codes';

export interface RateLimitErrorBody {
  statusCode: 429;
  code: ErrorCode.RATE_LIMIT_EXCEEDED;
  message: string;
  retryAfter: number;
  requestId: string;
  timestamp: string;
  path: string;
}

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ThrottlerExceptionFilter.name);

  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const responseData = exception.getResponse();
    const retryAfter = this.extractRetryAfter(responseData) ?? 60;
    const requestId = (request as any).requestId || 'unknown';

    // Set standard rate-limit headers
    response.setHeader('Retry-After', retryAfter.toString());
    response.setHeader('X-Request-Id', requestId);

    this.logger.warn(
      `RATE_LIMIT_EXCEEDED method=${request.method} path=${request.url} ip=${request.ip} requestId=${requestId} retryAfter=${retryAfter}`,
    );

    const body: RateLimitErrorBody = {
      statusCode: 429,
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: 'Too many requests. Please wait a moment and try again.',
      retryAfter,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(429).json(body);
  }

  private extractRetryAfter(responseData: unknown): number | undefined {
    if (typeof responseData === 'object' && responseData !== null) {
      const data = responseData as Record<string, unknown>;
      const retryAfter = data['retryAfter'];
      if (typeof retryAfter === 'number') {
        return retryAfter;
      }
    }
    return undefined;
  }
}
