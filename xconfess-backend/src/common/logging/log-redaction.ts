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

// Tokens embedded inside longer strings (e.g. an error message that quotes a header).
const EMBEDDED_BEARER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const EMBEDDED_JWT_PATTERN = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const EMBEDDED_TOKEN_PARAM_PATTERN =
  /([?&](?:token|access_token|refresh_token|reset_token|api_key|apikey|code)=)[^&#\s"']+/gi;

// ─── User-generated text fields (Issue #2282) ────────────────────────────────
//
// Confession, message, comment and search text must never reach logs. These
// fields are replaced with a length-only marker at any depth.

export const USER_CONTENT_FIELDS = new Set(
  [
    'content',
    'body',
    'text',
    'plaintext',
    'decryptedContent',
    'confessionContent',
    'messageContent',
    'commentContent',
    'replyContent',
    'confessionText',
    'messageText',
    'commentText',
    'rawTerm',
    'searchTerm',
  ].map((field) => field.toLowerCase()),
);

function isUserContentField(fieldName: string): boolean {
  return USER_CONTENT_FIELDS.has(fieldName.toLowerCase());
}

function userContentMarker(value: unknown): string {
  return typeof value === 'string'
    ? `[REDACTED:user-content,len=${value.length}]`
    : '[REDACTED:user-content]';
}

// ─── Allowed fields (Issue #2282) ────────────────────────────────────────────
//
// Operational fields that are logged verbatim. They are only kept verbatim
// when their value is a primitive; objects/arrays under these keys are still
// redacted recursively (e.g. `message: { body }` cannot smuggle content).

export const LOG_ALLOWED_FIELDS: ReadonlySet<string> = new Set([
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
  return redactObject(payload, new WeakSet()) as T;
}

/**
 * Redact any value passed to a logger (string, object, array, Error).
 * Used by the application-wide logger so every `Logger` call is covered.
 */
export function redactLogMessage(value: unknown): unknown {
  if (value instanceof Error) {
    return redactEmbeddedTokens(`${value.name}: ${value.message}`);
  }
  if (typeof value === 'string') {
    return redactEmbeddedTokens(redactStringValue(value));
  }
  if (Array.isArray(value)) {
    return redactValue('', value, new WeakSet());
  }
  if (value && typeof value === 'object') {
    return redactObject(value as Record<string, unknown>, new WeakSet());
  }
  return value;
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

/**
 * Remove tokens embedded inside longer strings: `Bearer <token>`,
 * JWTs, and token-like query parameters.
 */
export function redactEmbeddedTokens(value: string): string {
  return value
    .replace(EMBEDDED_BEARER_PATTERN, (_m, scheme) => `${scheme} ${REDACTED}`)
    .replace(EMBEDDED_JWT_PATTERN, REDACTED)
    .replace(EMBEDDED_TOKEN_PARAM_PATTERN, (_m, prefix) => `${prefix}${REDACTED}`);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function isSensitiveFieldName(fieldName: string): boolean {
  if (SENSITIVE_EXACT.has(fieldName)) {
    return true;
  }
  return SENSITIVE_PATTERNS.some((p) => p.test(fieldName));
}

function isPrimitive(value: unknown): boolean {
  return value === null || value === undefined || typeof value !== 'object';
}

function redactObject(
  payload: Record<string, unknown>,
  seen: WeakSet<object>,
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  if (seen.has(payload)) {
    return { circular: '[Circular]' };
  }
  seen.add(payload);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (LOG_ALLOWED_FIELDS.has(key) && isPrimitive(value)) {
      result[key] =
        typeof value === 'string' ? redactEmbeddedTokens(value) : value;
      continue;
    }
    result[key] = redactValue(key, value, seen);
  }
  return result;
}

function redactValue(key: string, value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (key && isUserContentField(key)) {
    return userContentMarker(value);
  }

  if (typeof value === 'string') {
    if (key && isSensitiveFieldName(key)) {
      return REDACTED;
    }
    return redactEmbeddedTokens(redactStringValue(value));
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    return value.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return Array.isArray(item)
          ? redactValue('', item, seen)
          : redactObject(item as Record<string, unknown>, seen);
      }
      if (typeof item === 'string') {
        return redactEmbeddedTokens(redactStringValue(item));
      }
      return item;
    });
  }

  if (typeof value === 'object') {
    return redactObject(value as Record<string, unknown>, seen);
  }

  return value;
}
