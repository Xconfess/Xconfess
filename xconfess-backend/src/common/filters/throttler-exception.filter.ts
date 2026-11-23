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
    // ThrottlerGuard writes the actual window details before throwing. Prefer
    // these headers over a guessed 60s window (which is wrong for strict
    // endpoint-specific throttlers).
    const retryAfter =
      this.extractRetryAfter(responseData) ??
      this.readPositiveHeader(response, 'Retry-After') ??
      this.secondsUntilReset(this.readPositiveHeader(response, 'X-RateLimit-Reset')) ??
      60;
    const requestId = (request as any).requestId || 'unknown';
    const limit =
      this.extractLimit(responseData) ??
      this.readPositiveHeader(response, 'X-RateLimit-Limit') ??
      0;
    const reset =
      this.readPositiveHeader(response, 'X-RateLimit-Reset') ??
      Math.ceil((Date.now() + retryAfter * 1000) / 1000);

    // Set standard rate-limit headers
    this.setHeaderIfMissing(response, 'Retry-After', retryAfter.toString());
    this.setHeaderIfMissing(response, 'X-Request-Id', requestId);
    this.setHeaderIfMissing(response, 'X-RateLimit-Limit', limit.toString());
    this.setHeaderIfMissing(response, 'X-RateLimit-Remaining', '0');
    this.setHeaderIfMissing(response, 'X-RateLimit-Reset', reset.toString());

    this.logger.warn(
      `RATE_LIMIT_EXCEEDED method=${request.method} path=${request.path} requestId=${requestId} retryAfter=${retryAfter}`,
    );

    const body: RateLimitErrorBody = {
      statusCode: 429,
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: 'Too many requests. Please wait a moment and try again.',
      retryAfter,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.path,
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

  private extractLimit(responseData: unknown): number | undefined {
    if (typeof responseData === 'object' && responseData !== null) {
      const data = responseData as Record<string, unknown>;
      const limit = data['limit'];
      if (typeof limit === 'number') {
        return limit;
      }
    }
    return undefined;
  }

  private readPositiveHeader(response: Response, name: string): number | undefined {
    const value = response.getHeader(name);
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  }

  private secondsUntilReset(resetEpochSeconds?: number): number | undefined {
    if (resetEpochSeconds === undefined) return undefined;
    return Math.max(1, resetEpochSeconds - Math.floor(Date.now() / 1000));
  }

  private setHeaderIfMissing(response: Response, name: string, value: string): void {
    if (response.getHeader(name) === undefined) response.setHeader(name, value);
  }
}
