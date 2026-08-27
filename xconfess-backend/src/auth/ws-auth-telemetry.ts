import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * Safe reason codes for WebSocket auth failures.
 * Never include raw token/cookie/email values — only enum-style codes.
 */
export enum WsAuthFailureReason {
  TOKEN_MISSING = 'TOKEN_MISSING',
  TOKEN_MALFORMED = 'TOKEN_MALFORMED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID_SIGNATURE = 'TOKEN_INVALID_SIGNATURE',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  SESSION_REVOKED = 'SESSION_REVOKED',
  UNKNOWN = 'UNKNOWN',
}

export interface WsAuthFailureEvent {
  correlationId: string;
  reason: WsAuthFailureReason;
  gateway: string;
  /** Optional extra context — must never contain PII */
  meta?: Record<string, string | number | boolean>;
}

/**
 * Scrubs any sensitive keys from an object before logging.
 * Removes Authorization, Cookie, token, jwt, email, wallet fields.
 */
const SENSITIVE_KEYS = /^(authorization|cookie|token|jwt|email|wallet|password|secret)/i;

export function scrubPii(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !SENSITIVE_KEYS.test(key)),
  );
}

/**
 * Emit a structured, PII-free auth failure log entry and return the correlation id.
 */
export function emitWsAuthFailure(
  logger: Logger,
  gateway: string,
  reason: WsAuthFailureReason,
  meta?: Record<string, string | number | boolean>,
): string {
  const correlationId = randomUUID();

  const event: WsAuthFailureEvent = {
    correlationId,
    reason,
    gateway,
    ...(meta ? { meta } : {}),
  };

  logger.warn(
    `WS_AUTH_FAILURE gateway=${gateway} reason=${reason} correlationId=${correlationId}`,
    event,
  );

  return correlationId;
}

/**
 * Classify a JWT/auth error into a safe WsAuthFailureReason code.
 * Never propagate the raw error message to the client.
 */
export function classifyAuthError(err: unknown): WsAuthFailureReason {
  if (!err) return WsAuthFailureReason.UNKNOWN;

  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (msg.includes('expired')) return WsAuthFailureReason.TOKEN_EXPIRED;
  if (msg.includes('malformed') || msg.includes('invalid token') || msg.includes('jwt malformed'))
    return WsAuthFailureReason.TOKEN_MALFORMED;
  if (msg.includes('invalid signature')) return WsAuthFailureReason.TOKEN_INVALID_SIGNATURE;
  if (msg.includes('user not found') || msg.includes('no user')) return WsAuthFailureReason.USER_NOT_FOUND;
  if (msg.includes('revoked') || msg.includes('blacklisted')) return WsAuthFailureReason.SESSION_REVOKED;

  return WsAuthFailureReason.UNKNOWN;
}
