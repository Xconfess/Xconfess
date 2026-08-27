import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  limit: number;
  window: number; // in seconds
  pairLimit?: number;
  pairWindow?: number;
}

export const RateLimit = (
  limit: number,
  window: number,
  pairLimit?: number,
  pairWindow?: number,
) => SetMetadata(RATE_LIMIT_KEY, { limit, window, pairLimit, pairWindow });
