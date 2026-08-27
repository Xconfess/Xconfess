import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * ------------------------------------------------------------
 * AUDIT LOG SENSITIVE FIELD DEFINITION
 * ------------------------------------------------------------
 *
 * The following field names are classified as **sensitive** and MUST be
 * redacted from audit-log metadata before persistence. This prevents
 * secrets, tokens, passwords, private keys, and raw encrypted payloads
 * from being written to durable storage.
 *
 * ## Sensitive Categories
 *
 * ### Authentication Tokens
 * `token`, `accessToken`, `refreshToken`, `resetToken`,
 * `passwordResetToken`, `bearerToken`, `authToken`, `jwtToken`,
 * `inviteToken`, `sessionToken`
 *
 * ### Passwords / Credentials
 * `password`, `passwordHash`, `newPassword`, `currentPassword`,
 * `passphrase`, `credential`
 *
 * ### Cryptographic Secrets & Keys
 * `secret`, `apiSecret`, `clientSecret`, `signingSecret`,
 * `encryptionKey`, `privateKey`, `apiKey`, `webhookSecret`,
 * `stellarSecret`
 *
 * ### Encrypted Payloads
 * `encryptedPayload`, `encryptedData`, `encryptedContent`,
 * `rawEncrypted`, `ciphertext`, `encryptedBody`
 *
 * ### Digital Signatures
 * `signature`, `signedMessage`, `digitalSignature`
 *
 * ### Pattern-Based Detection (case-insensitive on field name)
 * Fields whose names match any of these regex patterns:
 * - `secret|password|passphrase|credential`  — any field containing those words
 * - `encrypt|cipher`                          — encrypted/ciphertext fields
 * - `token$|_token$`                          — fields ending in "token" or "_token"
 * - `signature`                               — signature-bearing fields
 * - `privateKey|apiKey|bearer`                — key-bearing / bearer fields
 * - `authorization`                           — authorization header values
 *
 * ### Value-Based Detection (regardless of field name)
 * - **JWT tokens**: values matching `xxx.yyy.zzz` (three base64url segments)
 * - **Long hex strings**: hex strings >= 40 chars (suspected API keys or hashes)
 *
 * ## Fields Explicitly Preserved (useful audit context)
 *
 * These field names are NEVER redacted because they carry essential
 * operational context for incident investigation:
 *
 * - `entityType`, `entityId`, `confessionId`, `commentId`, `reportId`
 * - `actorType`, `actorId`, `actorLabel`, `actorSource`, `actorUserId`
 * - `templateKey`, `templateVersion`, `changeType`
 * - `actionType`, `action`, `outcome`, `reason`, `flags`, `score`
 * - Timestamps: `*At`, `*.createdAt`, `*.updatedAt`, etc.
 * - `summary`, `before`, `after`, `diff`, `filters`, `outcomes`
 * - `requestId`, `exportId`, `correlationId`
 * ------------------------------------------------------------
 */

const SENSITIVE_EXACT_FIELDS = new Set([
  'token',
  'accessToken',
  'refreshToken',
  'resetToken',
  'passwordResetToken',
  'bearerToken',
  'authToken',
  'jwtToken',
  'inviteToken',
  'sessionToken',
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'passphrase',
  'credential',
  'secret',
  'apiSecret',
  'clientSecret',
  'signingSecret',
  'encryptionKey',
  'privateKey',
  'apiKey',
  'webhookSecret',
  'stellarSecret',
  'encryptedPayload',
  'encryptedData',
  'encryptedContent',
  'rawEncrypted',
  'ciphertext',
  'encryptedBody',
  'signature',
  'signedMessage',
  'digitalSignature',
  'authorization',
]);

const SENSITIVE_NAME_PATTERNS: RegExp[] = [
  /secret/i,
  /password/i,
  /passphrase/i,
  /credential/i,
  /encrypt/i,
  /cipher/i,
  /token$/i,
  /_token$/i,
  /signature/i,
  /privateKey/i,
  /apiKey/i,
  /bearer/i,
  /authorization/i,
];

const JWT_PATTERN = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;
const LONG_HEX_PATTERN = /^[0-9a-fA-F]{40,}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REDACTED_VALUE = '[REDACTED]';
const REDACTED_EMAIL = '[REDACTED_EMAIL]';
const USER_ID_PREFIX = 'user_';
const USER_ID_HASH_LENGTH = 12;

type RedactableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | RedactableObject
  | RedactableArray;
interface RedactableObject {
  [key: string]: RedactableValue;
}
type RedactableArray = RedactableValue[];

@Injectable()
export class AuditLogRedactionService {
  private readonly logger = new Logger(AuditLogRedactionService.name);

  /**
   * Returns the documented list of sensitive field names.
   * Exposed for test assertions and documentation purposes.
   */
  static getSensitiveFields(): ReadonlySet<string> {
    return SENSITIVE_EXACT_FIELDS;
  }

  /**
   * Returns the regex patterns used for sensitive field name detection.
   * Exposed for test assertions and documentation purposes.
   */
  static getSensitivePatterns(): readonly RegExp[] {
    return SENSITIVE_NAME_PATTERNS;
  }

  /**
   * Determine if a field name is considered sensitive.
   */
  isSensitiveField(fieldName: string): boolean {
    if (SENSITIVE_EXACT_FIELDS.has(fieldName)) {
      return true;
    }

    for (const pattern of SENSITIVE_NAME_PATTERNS) {
      if (pattern.test(fieldName)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Recursively redact sensitive values from audit metadata.
   * Returns a new object; never mutates the input.
   */
  redactMetadata(
    metadata: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== 'object') {
      return (metadata as Record<string, unknown> | null) ?? null;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      result[key] = this.redactField(key, value);
    }
    return result;
  }

  private redactField(key: string, value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      return this.redactMetadata(value as Record<string, unknown>);
    }

    if (Array.isArray(value)) {
      return value.map((item) => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return this.redactMetadata(item as Record<string, unknown>);
        }
        if (Array.isArray(item)) {
          return item.map(
            (inner) =>
              typeof inner === 'object' && inner !== null
                ? this.redactMetadata(inner as Record<string, unknown>)
                : this.redactScalarValue(key, inner),
          );
        }
        return this.redactScalarValue(key, item);
      });
    }

    return this.redactScalarValue(key, value);
  }

  private redactScalarValue(key: string, value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    const stringValue = value as string;

    if (this.isSensitiveField(key)) {
      return REDACTED_VALUE;
    }

    if (
      JWT_PATTERN.test(stringValue) &&
      stringValue.split('.').length === 3
    ) {
      return this.maskJwt(stringValue);
    }

    if (
      (key.toLowerCase().includes('email') ||
        key.toLowerCase() === 'sender' ||
        key.toLowerCase() === 'recipient') &&
      EMAIL_PATTERN.test(stringValue)
    ) {
      return this.maskEmail(stringValue);
    }

    if (
      (key === 'userId' ||
        key === 'targetUserId') &&
      /^\d+$/.test(stringValue)
    ) {
      return this.maskUserId(stringValue);
    }

    if (LONG_HEX_PATTERN.test(stringValue)) {
      return this.maskLongHex(stringValue);
    }

    return value;
  }

  /**
   * Mask a user ID using SHA-256 hashing for consistent anonymous references.
   */
  maskUserId(userId: string | number): string {
    const hash = createHash('sha256')
      .update(String(userId))
      .digest('hex')
      .substring(0, USER_ID_HASH_LENGTH);
    return `${USER_ID_PREFIX}${hash}`;
  }

  /**
   * Mask an email address, preserving partial structure for debugging.
   */
  maskEmail(email: string): string {
    const atIndex = email.indexOf('@');
    if (atIndex <= 0) {
      return REDACTED_EMAIL;
    }

    const localPart = email.substring(0, atIndex);
    const domain = email.substring(atIndex);

    if (localPart.length <= 2) {
      return `*${domain}`;
    }

    return `${localPart.substring(0, 2)}***${domain}`;
  }

  maskJwt(token: string): string {
    const parts = token.split('.');
    if (parts.length === 3) {
      return `xxx.${parts.slice(0, 2).join('.')}.xxx`;
    }
    return REDACTED_VALUE;
  }

  maskLongHex(hex: string): string {
    if (hex.length <= 8) {
      return hex;
    }
    return `${hex.substring(0, 4)}...${hex.substring(hex.length - 4)}`;
  }
}
