import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { getRateLimitConfig, RateLimitConfig } from '../../config/rate-limit.config';
import { ErrorCode } from '../../common/errors/error-codes';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private rateLimitStore = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    this.config = getRateLimitConfig(configService);
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // Get sender identifier (user ID if authenticated, else IP)
    const user = (request as any).user;
    const userId = user?.sub || user?.id;
    const senderId = userId
      ? `user:${userId}`
      : `ip:${this.getClientId(request)}`;

    const customRateLimit = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    // Determine rate limit based on endpoint decorator or HTTP method fallback
    const { limit, window } =
      customRateLimit || this.getRateLimitForMethod(method);

    const now = Date.now();
    const key = `${senderId}:${method}:${context.getHandler()?.name || 'default'}`;

    // 1. Check & record sender-level limit
    this.checkAndIncrement(key, limit, window, now, request);

    // 2. Check & record sender-recipient pair limit if applicable
    const recipientId =
      request.body?.recipientId ||
      request.body?.recipient_id ||
      request.body?.confessionId ||
      request.body?.confession_id ||
      request.params?.userId;

    const pairLimit =
      customRateLimit?.pairLimit ?? this.config.messagePairLimit;
    const pairWindow =
      customRateLimit?.pairWindow ?? this.config.messagePairWindow;

    if (recipientId && (customRateLimit?.pairLimit !== undefined || method === 'POST')) {
      const pairKey = `pair:${senderId}:${recipientId}`;
      this.checkAndIncrement(pairKey, pairLimit, pairWindow, now, request);
    }

    return true;
  }

  private checkAndIncrement(
    key: string,
    limit: number,
    window: number,
    now: number,
    request: Request,
  ): void {
    const entry = this.rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      this.rateLimitStore.set(key, {
        count: 1,
        resetTime: now + window * 1000,
      });
      return;
    }

    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Too many requests, please try again later',
          retryAfter,
          limit,
          requestId: (request as any).requestId || 'unknown',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count++;
  }

  private getClientId(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (request.headers['x-real-ip'] as string) ||
      request.ip ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }

  private getRateLimitForMethod(method: string): {
    limit: number;
    window: number;
  } {
    switch (method) {
      case 'POST':
      case 'PUT':
      case 'PATCH':
      case 'DELETE':
        return {
          limit: this.config.postLimit,
          window: this.config.postWindow,
        };
      case 'GET':
      default:
        return {
          limit: this.config.getLimit,
          window: this.config.getWindow,
        };
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        this.rateLimitStore.delete(key);
      }
    }
  }
}
