import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Strict throttler guard for RPC-expensive Stellar routes
 * (confession anchoring, tip verification).
 *
 * Keys by `${ip}:${confessionId}` instead of IP alone, so a single
 * caller can still anchor/verify across different confessions without
 * burning their whole budget on one resource, while repeated hammering
 * of a single confession's verify/anchor route is throttled hard.
 *
 * Falls back to IP-only if no `:id` route param is present (defensive;
 * shouldn't happen given current route shapes, but avoids a thrown
 * error if this guard is ever reused on a route without that param).
 */
@Injectable()
export class StrictThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const confessionId =
      (req.params && (req.params.id as string | undefined)) ?? 'unknown';
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    return `${ip}:${confessionId}`;
  }
}