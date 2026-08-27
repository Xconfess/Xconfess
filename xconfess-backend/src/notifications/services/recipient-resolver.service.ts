import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { CryptoUtil } from '../../common/crypto.util';

export interface RecipientResolutionResult {
  success: boolean;
  email?: string;
  userId?: number;
  reason?: string;
  logContext: Record<string, unknown>;
}

/**
 * Result of attempting to resolve a recipient for notification.
 * Includes both the resolved email (if any) and structured logging context.
 */
export interface NotificationRecipient {
  /** The resolved email address, if available */
  email: string | null;
  /** Whether the recipient can receive notifications */
  canNotify: boolean;
  /** User ID if resolved from User entity */
  userId?: number;
  /** Reason why notification cannot be sent */
  reason?: string;
}

/**
 * Centralized service for resolving recipient email addresses for notifications.
 *
 * Handles:
 * - Decrypting email from User entity (encrypted email model)
 * - Gracefully handling missing email (AnonymousUser or unverified users)
 * - Providing structured logs for debugging notification failures
 *
 * This service addresses the issue where notification send paths expect direct
 * user email fields that may not exist due to the encrypted email model.
 */
@Injectable()
export class RecipientResolver {
  private readonly logger = new Logger(RecipientResolver.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  /**
   * Resolve the email address for a user ID.
   *
   * This method:
   * 1. Fetches the user from the database
   * 2. Decrypts the encrypted email field
   * 3. Returns a structured result with proper logging context
   *
   * @param userId - The ID of the user to resolve email for
   * @returns NotificationRecipient with the resolved email or reason for failure
   */
  async resolveRecipient(userId: number): Promise<NotificationRecipient> {
    const logContext = {
      service: 'RecipientResolver',
      userId,
      timestamp: new Date().toISOString(),
    };

    try {
      // Fetch user with email fields
      const user = await this.userRepo.findOne({
        where: { id: userId },
        select: ['id', 'emailEncrypted', 'emailIv', 'emailTag', 'emailHash'],
      });

      if (!user) {
        const result: NotificationRecipient = {
          email: null,
          canNotify: false,
          userId,
          reason: 'USER_NOT_FOUND',
        };

        this.logger.warn(
          `Cannot resolve recipient: User not found for ID ${userId}`,
          { ...logContext, result },
        );

        return result;
      }

      // Check if user has encrypted email data
      if (!user.emailEncrypted || !user.emailIv || !user.emailTag) {
        const result: NotificationRecipient = {
          email: null,
          canNotify: false,
          userId,
          reason: 'MISSING_ENCRYPTED_EMAIL',
        };

        this.logger.warn(
          `Cannot resolve recipient: User ${userId} has no encrypted email data`,
          { ...logContext, hasEmailEncrypted: !!user.emailEncrypted, result },
        );

        return result;
      }

      // Attempt to decrypt the email
      try {
        const decryptedEmail = CryptoUtil.decrypt(
          user.emailEncrypted,
          user.emailIv,
          user.emailTag,
        );

        // Validate the decrypted email
        if (!this.isValidEmail(decryptedEmail)) {
          const result: NotificationRecipient = {
            email: null,
            canNotify: false,
            userId,
            reason: 'INVALID_DECRYPTED_EMAIL',
          };

          this.logger.warn(`Decrypted email is invalid for user ${userId}`, {
            ...logContext,
            result,
          });

          return result;
        }

        const result: NotificationRecipient = {
          email: decryptedEmail,
          canNotify: true,
          userId,
        };

        this.logger.debug(
          `Successfully resolved recipient email for user ${userId}`,
          { ...logContext, email: this.maskEmail(decryptedEmail) },
        );

        return result;
      } catch (decryptError) {
        const errorMessage =
          decryptError instanceof Error
            ? decryptError.message
            : 'Unknown decryption error';

        const result: NotificationRecipient = {
          email: null,
          canNotify: false,
          userId,
          reason: 'DECRYPTION_FAILED',
        };

        this.logger.error(
          `Failed to decrypt email for user ${userId}: ${errorMessage}`,
          { ...logContext, error: errorMessage, result },
        );

        return result;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      const result: NotificationRecipient = {
        email: null,
        canNotify: false,
        userId,
        reason: 'RESOLUTION_ERROR',
      };

      this.logger.error(
        `Unexpected error resolving recipient for user ${userId}: ${errorMessage}`,
        { ...logContext, error: errorMessage, result },
      );

      return result;
    }
  }

  /**
   * Resolve multiple recipients at once.
   *
   * @param userIds - Array of user IDs to resolve
   * @returns Map of userId to NotificationRecipient
   */
  async resolveRecipients(
    userIds: number[],
  ): Promise<Map<number, NotificationRecipient>> {
    const results = new Map<number, NotificationRecipient>();

    await Promise.all(
      userIds.map(async (userId) => {
        const recipient = await this.resolveRecipient(userId);
        results.set(userId, recipient);
      }),
    );

    return results;
  }

  /**
   * Check if an email address is valid.
   */
  private isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Mask email for logging (show only first few characters and domain).
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain) {
      return '***';
    }

    const maskedLocal =
      localPart.length > 3 ? `${localPart.substring(0, 3)}***` : '***';

    return `${maskedLocal}@${domain}`;
  }
}
