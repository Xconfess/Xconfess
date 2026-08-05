import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { PasswordReset } from './entities/password-reset.entity';
import * as crypto from 'crypto';

export type PasswordResetConsumeReason =
  | 'valid'
  | 'invalid'
  | 'expired'
  | 'reused';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordReset)
    private passwordResetRepository: Repository<PasswordReset>,
  ) {}

  /**
   * Reset tokens are high-entropy (32 random bytes) single-use secrets, so a
   * fast cryptographic hash is sufficient (no need for a slow, salted
   * password hash) — this mirrors how most frameworks hash session/API
   * tokens. Only the hash is ever written to the database.
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createResetToken(
    userId: number,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<string> {
    try {
      // Invalidate any outstanding tokens for this user first, so at most
      // one reset token is ever valid at a time regardless of caller.
      await this.invalidateUserTokens(userId);

      // Generate a secure random token. This raw value is returned to the
      // caller (for the reset email) and is NEVER persisted — only its hash is.
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = this.hashToken(token);

      // Set expiration to 15 minutes from now
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      // Create password reset record
      const passwordReset = this.passwordResetRepository.create({
        tokenHash,
        userId,
        expiresAt,
        ipAddress,
        userAgent,
      });

      await this.passwordResetRepository.save(passwordReset);

      this.logger.log(`Password reset token created for user ID: ${userId}`, {
        userId,
        tokenId: passwordReset.id,
        expiresAt,
        ipAddress,
      });

      return token;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to create reset token for user ID ${userId}: ${errorMessage}`,
      );
      throw new Error(`Failed to create reset token: ${errorMessage}`);
    }
  }

  async findValidToken(token: string): Promise<PasswordReset | null> {
    try {
      const tokenHash = this.hashToken(token);
      const passwordReset = await this.passwordResetRepository.findOne({
        where: {
          tokenHash,
          used: false,
        },
        relations: ['user'],
      });

      if (!passwordReset) {
        this.logger.debug(`No unused token found`);
        return null;
      }

      // Check if token has expired
      if (new Date() > passwordReset.expiresAt) {
        this.logger.debug(`Token expired`, {
          tokenId: passwordReset.id,
          expiresAt: passwordReset.expiresAt,
        });
        return null;
      }

      return passwordReset;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error finding token: ${errorMessage}`);
      throw new Error(`Error finding token: ${errorMessage}`);
    }
  }

  /**
   * Atomically consumes a reset token if it is valid.
   * This prevents concurrent reuse by marking `used=true` in a single DB update.
   */
  async consumeValidToken(
    token: string,
    now: Date = new Date(),
  ): Promise<{
    reset: PasswordReset | null;
    reason: PasswordResetConsumeReason;
  }> {
    const tokenHash = this.hashToken(token);

    const existing = await this.passwordResetRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!existing) return { reset: null, reason: 'invalid' };
    if (existing.used) return { reset: null, reason: 'reused' };
    if (existing.expiresAt <= now) return { reset: null, reason: 'expired' };

    // Atomic consume:
    // Only the first concurrent consumer will get affected=1.
    const updateResult = await this.passwordResetRepository.update(
      { tokenHash, used: false, expiresAt: MoreThan(now) },
      { used: true, usedAt: now },
    );

    if (!updateResult.affected) {
      // Token was likely consumed concurrently between the initial read and update.
      return { reset: null, reason: 'reused' };
    }

    const consumed = await this.passwordResetRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    // consumed should exist; if it doesn't, treat as invalid (defensive fallback).
    if (!consumed) return { reset: null, reason: 'invalid' };
    return { reset: consumed, reason: 'valid' };
  }

  async markTokenAsUsed(tokenId: number): Promise<void> {
    try {
      await this.passwordResetRepository.update(tokenId, {
        used: true,
        usedAt: new Date(),
      });

      this.logger.log(`Password reset token marked as used`, {
        tokenId,
        usedAt: new Date(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to mark token as used: ${errorMessage}`);
      throw new Error(`Failed to mark token as used: ${errorMessage}`);
    }
  }

  async invalidateUserTokens(userId: number): Promise<void> {
    try {
      await this.passwordResetRepository.update(
        { userId, used: false },
        { used: true, usedAt: new Date() },
      );

      this.logger.log(`All tokens invalidated for user ID: ${userId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to invalidate tokens for user ${userId}: ${errorMessage}`,
      );
      throw new Error(`Failed to invalidate tokens: ${errorMessage}`);
    }
  }

  async cleanupExpiredTokens(): Promise<void> {
    try {
      const now = new Date();
      const result = await this.passwordResetRepository.delete({
        expiresAt: LessThan(now),
      });
      const deletedCount = result.affected || 0;
      this.logger.log(`Cleaned up expired password reset tokens`, {
        deletedCount,
        timestamp: now.toISOString(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to cleanup expired tokens: ${errorMessage}`);
    }
  }
}
