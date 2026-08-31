/**
 * Structured Log Redaction
 *
 * Recursively redacts sensitive fields from log payloads before they are
 * written to stdout/file. This is the single source of truth for what is
 * considered sensitive in log output.
 *
 * Design:
 *  – Returns a *new* object; never mutates the input.
 *  – Handles nested objects, arrays, and primitives.
 *  – Detects both field-name patterns (e.g. any field ending in "token")
 *    and value patterns (e.g. JWT-shaped strings, long hex blobs).
 *  – Preserves request IDs, timestamps, error codes, and status fields
 *    that operators need for incident investigation.
 */

const REDACTED = '[REDACTED]';

// ─── Sensitive field-name patterns (case-insensitive) ────────────────────────

const SENSITIVE_EXACT = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'passphrase',
  'secret',
  'apiSecret',
  'clientSecret',
  'signingSecret',
  'encryptionKey',
  'privateKey',
  'apiKey',
  'webhookSecret',
  'stellarSecret',
  'jwtSecret',
  'sessionSecret',
  'token',
  'accessToken',
  'refreshToken',
  'resetToken',
  'bearerToken',
  'authToken',
  'jwtToken',
  'sessionToken',
  'authorization',
  'cookie',
  'setCookie',
  'encryptedPayload',
  'encryptedData',
  'ciphertext',
  'seedPhrase',
  'seed',
  'signingKey',
]);

const SENSITIVE_PATTERNS: RegExp[] = [
  /password/i,
  /secret/i,
  /token$/i,
  /_token$/i,
  /privatekey/i,
  /apikey/i,
  /authorization/i,
  /credential/i,
  /encrypt/i,
  /cipher/i,
  /seedphrase/i,
];

// ─── Sensitive value patterns ────────────────────────────────────────────────

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const LONG_HEX_PATTERN = /^[0-9a-fA-F]{40,}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]{40,}={0,2}$/;

// ─── Fields always preserved in logs ─────────────────────────────────────────

const PRESERVED_FIELDS = new Set([
  'requestId',
  'correlationId',
  'timestamp',
  'statusCode',
  'status',
  'method',
  'route',
  'path',
  'duration',
  'durationMs',
  'subsystem',
  'errorClass',
  'code',
  'message',
  'level',
  'event',
  'severity',
  'userId',
  'userRole',
  'action',
  'entityType',
  'entityId',
]);

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Redact sensitive fields from a log payload object.
 * Returns a new object; the original is never mutated.
 */
export function redactLogPayload<T extends Record<string, unknown>>(
  payload: T,
): T {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (PRESERVED_FIELDS.has(key)) {
      result[key] = value;
      continue;
    }
    result[key] = redactValue(key, value);
  }
  return result as T;
}

/**
 * Redact a single string value that might contain sensitive data
 * (JWT tokens, hex keys, etc.) regardless of its field name.
 */
export function redactStringValue(value: string): string {
  if (JWT_PATTERN.test(value)) {
    return REDACTED;
  }
  if (LONG_HEX_PATTERN.test(value)) {
    return `${value.slice(0, 4)}...REDACTED`;
  }
  if (BASE64_PATTERN.test(value) && value.length > 80) {
    return REDACTED;
  }
  return value;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function isSensitiveFieldName(fieldName: string): boolean {
  if (SENSITIVE_EXACT.has(fieldName)) {
    return true;
  }
  return SENSITIVE_PATTERNS.some((p) => p.test(fieldName));
}

function redactValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (isSensitiveFieldName(key)) {
      return REDACTED;
    }
    return redactStringValue(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return redactLogPayload(item as Record<string, unknown>);
      }
      if (typeof item === 'string') {
        return redactStringValue(item);
      }
      return item;
    });
  }

  if (typeof value === 'object') {
    return redactLogPayload(value as Record<string, unknown>);
  }

  return value;
}
