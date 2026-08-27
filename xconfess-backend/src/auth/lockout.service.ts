import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export interface LockoutStatus {
  isLocked: boolean;
  attemptsRemaining: number;
  lockedUntil?: Date;
  lockCount: number;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATIONS_SECONDS = [15 * 60, 30 * 60, 60 * 60, 24 * 60 * 60];
const ATTEMPTS_KEY = (email: string) => `lockout:attempts:${email}`;
const LOCKED_KEY = (email: string) => `lockout:locked:${email}`;
const COUNT_KEY = (email: string) => `lockout:count:${email}`;

@Injectable()
export class LockoutService {
  private readonly logger = new Logger(LockoutService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async getStatus(email: string): Promise<LockoutStatus> {
    const locked = await this.cache.get<string>(LOCKED_KEY(email));
    const lockCount = parseInt(
      (await this.cache.get<string>(COUNT_KEY(email))) ?? '0',
      10,
    );
    if (locked) {
      return {
        isLocked: true,
        attemptsRemaining: 0,
        lockedUntil: new Date(locked),
        lockCount,
      };
    }
    const attempts = parseInt(
      (await this.cache.get<string>(ATTEMPTS_KEY(email))) ?? '0',
      10,
    );
    return {
      isLocked: false,
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts),
      lockCount,
    };
  }

  async recordFailedAttempt(email: string): Promise<LockoutStatus> {
    const raw = await this.cache.get<string>(ATTEMPTS_KEY(email));
    const attempts = parseInt(raw ?? '0', 10) + 1;
    await this.cache.set(ATTEMPTS_KEY(email), String(attempts), 30 * 60);

    if (attempts >= MAX_ATTEMPTS) {
      const rawCount = await this.cache.get<string>(COUNT_KEY(email));
      const lockCount = parseInt(rawCount ?? '0', 10) + 1;
      const durationSeconds =
        LOCKOUT_DURATIONS_SECONDS[
          Math.min(lockCount - 1, LOCKOUT_DURATIONS_SECONDS.length - 1)
        ];
      const lockedUntil = new Date(Date.now() + durationSeconds * 1000);
      await this.cache.set(
        LOCKED_KEY(email),
        lockedUntil.toISOString(),
        durationSeconds,
      );
      await this.cache.set(
        COUNT_KEY(email),
        String(lockCount),
        7 * 24 * 60 * 60,
      );
      await this.cache.del(ATTEMPTS_KEY(email));
      this.logger.warn(
        `Account locked: ${email} (lock #${lockCount}, duration ${durationSeconds}s)`,
      );
      return { isLocked: true, attemptsRemaining: 0, lockedUntil, lockCount };
    }

    return {
      isLocked: false,
      attemptsRemaining: MAX_ATTEMPTS - attempts,
      lockCount: parseInt(
        (await this.cache.get<string>(COUNT_KEY(email))) ?? '0',
        10,
      ),
    };
  }

  async clearLockout(email: string): Promise<void> {
    await this.cache.del(ATTEMPTS_KEY(email));
    await this.cache.del(LOCKED_KEY(email));
    this.logger.log(`Lockout cleared for: ${email}`);
  }
}
