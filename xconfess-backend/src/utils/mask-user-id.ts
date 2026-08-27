// src/utils/user-id-masker.ts
import { createHash } from 'crypto';

// Regex patterns for PII and secrets
const EMAIL_REGEX =
  /([a-zA-Z0-9._%+-]{2})[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const TOKEN_REGEX = /([A-Za-z0-9]{3})[A-Za-z0-9\-_]{4,}([A-Za-z0-9]{3})/g;
const TEMPLATE_VAR_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function maskEmail(email: string): string {
  // Mask all but first 2 chars and domain
  return email.replace(EMAIL_REGEX, (_m, p1, domain) => `${p1}***@${domain}`);
}

function maskToken(token: string): string {
  // Mask all but first/last 3 chars
  return token.replace(TOKEN_REGEX, (_m, start, end) => `${start}***${end}`);
}

function maskTemplateVars(str: string): string {
  // Replace template variables with a placeholder
  return str.replace(TEMPLATE_VAR_REGEX, '{{***}}');
}

function maskStringPII(str: string): string {
  let masked = maskEmail(str);
  masked = maskToken(masked);
  masked = maskTemplateVars(masked);
  return masked;
}

/**
 * Masks user IDs for logging to preserve anonymity
 * Uses SHA256 hashing and truncates to 12 characters for readability
 */
export class UserIdMasker {
  private static readonly PREFIX = 'user_';
  private static readonly HASH_LENGTH = 12;

  /**
   * Masks a user ID using SHA256 hashing
   * @param userId - The raw user ID to mask
   * @returns Masked identifier (e.g., "user_a3f9c2d1b5e7")
   */
  static mask(userId: string | number): string {
    if (!userId) {
      return 'user_anonymous';
    }

    const hash = createHash('sha256')
      .update(String(userId))
      .digest('hex')
      .substring(0, this.HASH_LENGTH);

    return `${this.PREFIX}${hash}`;
  }

  /**
   * Masks multiple user IDs
   * @param userIds - Array of user IDs to mask
   * @returns Array of masked identifiers
   */
  static maskMany(userIds: (string | number)[]): string[] {
    return userIds.map((id) => this.mask(id));
  }

  /**
   * Masks user ID in an object (useful for logging objects)
   * @param obj - Object containing userId field
   * @returns New object with masked userId
   */
  /**
   * Recursively masks sensitive fields in an object for logging.
   * - Masks userId, email, token, and template variables.
   * - Preserves enough context for debugging.
   */
  static maskObject<T extends Record<string, any>>(
    obj: T,
    idField: string = 'userId',
  ): T {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const sensitiveFields = [
      'userId',
      'email',
      'recipientEmail',
      'token',
      'accessToken',
      'refreshToken',
    ];
    const masked: any = Array.isArray(obj) ? [] : { ...obj };

    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (sensitiveFields.includes(key) && typeof value === 'string') {
        if (key.toLowerCase().includes('email')) {
          masked[key] = maskEmail(value);
        } else if (key.toLowerCase().includes('token')) {
          masked[key] = maskToken(value);
        } else if (key === 'userId') {
          masked[key] = this.mask(value);
        } else {
          masked[key] = maskStringPII(value);
        }
      } else if (typeof value === 'string') {
        masked[key] = maskStringPII(value);
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskObject(value);
      } else {
        masked[key] = value;
      }
    }
    return masked as T;
  }
}

// Convenience function for quick masking
export const maskUserId = (userId: string | number): string =>
  UserIdMasker.mask(userId);
