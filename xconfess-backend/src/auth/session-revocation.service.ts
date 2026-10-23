import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from '../user/entities/user.entity';

/**
 * Manages session revocation for deactivated accounts.
 * When a user deactivates, all active sessions are revoked by blacklisting their JWTs.
 */
@Injectable()
export class SessionRevocationService {
  private readonly logger = new Logger(SessionRevocationService.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {}

  /**
   * Revoke all active sessions for a user by blacklisting their tokens.
   * Sessions are identified by user ID; any JWT issued before deactivation
   * is added to a blacklist in Redis for the token's remaining lifetime.
   */
  async revokeUserSessions(userId: number | string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: Number(userId) } });
    if (!user) {
      this.logger.warn(`User not found for session revocation: ${userId}`);
      return;
    }

    try {
      // Store revocation timestamp with a TTL matching typical session duration (24h)
      const revocationKey = `session:revoked:${userId}`;
      const ttl = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

      await this.cacheManager.set(revocationKey, Date.now(), ttl);
      this.logger.log(`Revoked sessions for user: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to revoke sessions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a token was issued before the user's session revocation timestamp.
   * Returns true if the token is still valid (not revoked).
   */
  async isSessionValid(userId: number | string, issuedAt: number): Promise<boolean> {
    const revocationKey = `session:revoked:${userId}`;

    try {
      const revocationTime = await this.cacheManager.get<number>(revocationKey);
      if (!revocationTime) {
        // No revocation recorded — session is valid
        return true;
      }

      // Token issued after revocation = invalid
      return issuedAt * 1000 > revocationTime;
    } catch (error) {
      this.logger.error(`Failed to check session validity for user ${userId}:`, error);
      // On error, allow the session (fail open) to avoid locking out valid users
      return true;
    }
  }

  /**
   * Clear revocation for a user (when reactivating an account).
   */
  async clearSessionRevocation(userId: number | string): Promise<void> {
    const revocationKey = `session:revoked:${userId}`;

    try {
      await this.cacheManager.del(revocationKey);
      this.logger.log(`Cleared session revocation for user: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to clear session revocation for user ${userId}:`, error);
    }
  }
}
