import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';

/**
 * Stellar RPC / Horizon rate-limit handling (Issue #2279).
 *
 * When the provider throttles (HTTP 429), retries:
 *  - honor the provider's `Retry-After` hint when present;
 *  - otherwise back off exponentially (base * 2^attempt);
 *  - never wait longer than `maxDelayMs` per attempt and never exceed
 *    `maxRetries` retries (STELLAR_RPC_MAX_RETRIES / STELLAR_RPC_RETRY_*).
 *
 * If the hint asks for longer than `maxDelayMs`, or attempts are exhausted,
 * the caller fails fast with `StellarRpcUnavailableException` (HTTP 503 with
 * `Retry-After`) instead of hammering the provider.
 */

export interface RpcRetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export type RateLimitRetryPlan =
  | { retry: true; delayMs: number }
  | { retry: false; retryAfterSeconds: number };

/** Safe, constant message: never includes provider responses or request data. */
export const STELLAR_RPC_UNAVAILABLE_MESSAGE =
  'The Stellar network is temporarily unavailable. Please retry later.';

export class StellarRpcUnavailableException extends AppException {
  constructor(retryAfterSeconds: number) {
    super(
      STELLAR_RPC_UNAVAILABLE_MESSAGE,
      ErrorCode.SERVICE_UNAVAILABLE,
      HttpStatus.SERVICE_UNAVAILABLE,
      undefined,
      retryAfterSeconds,
    );
  }
}

type ErrorWithResponse = {
  status?: number;
  statusCode?: number;
  response?: {
    status?: number;
    statusCode?: number;
    headers?: unknown;
  };
  headers?: unknown;
  message?: string;
};

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as ErrorWithResponse;
  return e.response?.status ?? e.response?.statusCode ?? e.status ?? e.statusCode;
}

export function isRateLimitError(error: unknown): boolean {
  if (statusOf(error) === 429) return true;
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /\b429\b|too many requests|rate limit/i.test(message);
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    const value = (headers as { get: (n: string) => unknown }).get(name);
    return value == null ? undefined : String(value);
  }
  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (key.toLowerCase() === name.toLowerCase() && value != null) {
        return String(Array.isArray(value) ? value[0] : value);
      }
    }
  }
  return undefined;
}

/**
 * Parse a `Retry-After` hint (delta-seconds or HTTP date) from the error.
 * Returns milliseconds, or `undefined` when absent or unparseable.
 */
export function getRetryAfterMs(error: unknown, now: number = Date.now()): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as ErrorWithResponse;
  const raw = readHeader(e.response?.headers, 'retry-after') ?? readHeader(e.headers, 'retry-after');
  if (raw === undefined) return undefined;

  const trimmed = raw.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed) * 1000);
  }
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - now);
  }
  return undefined;
}

/**
 * Decide whether to retry a rate-limited call, and how long to wait.
 * `attempt` is zero-based (0 = the first call just failed).
 */
export function planRateLimitRetry(
  error: unknown,
  attempt: number,
  policy: RpcRetryPolicy,
  now: number = Date.now(),
): RateLimitRetryPlan {
  const hintMs = getRetryAfterMs(error, now);
  const backoffMs = Math.min(policy.baseDelayMs * Math.pow(2, attempt), policy.maxDelayMs);
  const toSeconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

  if (attempt >= policy.maxRetries) {
    return { retry: false, retryAfterSeconds: toSeconds(hintMs ?? backoffMs) };
  }
  if (hintMs !== undefined && hintMs > policy.maxDelayMs) {
    // The provider wants us to wait longer than we are allowed to block a
    // request: fail fast and pass the hint on to the client.
    return { retry: false, retryAfterSeconds: toSeconds(hintMs) };
  }
  return { retry: true, delayMs: hintMs ?? backoffMs };
}

/** A synthetic 429 error for fetch-based calls, carrying the response headers. */
export function rateLimitErrorFromResponse(response: {
  status: number;
  headers?: unknown;
}): Error & ErrorWithResponse {
  return Object.assign(new Error('Stellar RPC rate limited (429)'), {
    status: response.status,
    response: { status: response.status, headers: response.headers },
  });
}

interface RpcRetryConfig {
  rpcMaxRetries: number;
  rpcRetryBaseDelayMs: number;
  rpcRetryMaxDelayMs: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Call from a retry loop's `catch` when `isRateLimitError(error)` is true.
 * Waits the planned delay (then the caller `continue`s), or throws
 * `StellarRpcUnavailableException` when retrying is not allowed.
 * Logs only the operation name, attempt counts and delay.
 */
export async function backOffOrFail(
  operation: string,
  error: unknown,
  attempt: number,
  config: RpcRetryConfig,
  logger: { warn: (message: string) => void },
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<void> {
  const plan = planRateLimitRetry(error, attempt, {
    maxRetries: config.rpcMaxRetries,
    baseDelayMs: config.rpcRetryBaseDelayMs,
    maxDelayMs: config.rpcRetryMaxDelayMs,
  });
  const attempts = `${attempt + 1}/${config.rpcMaxRetries + 1}`;

  if (!plan.retry) {
    logger.warn(
      `${operation} rate limited by Stellar RPC (attempt ${attempts}); returning 503, retry after ${plan.retryAfterSeconds}s`,
    );
    throw new StellarRpcUnavailableException(plan.retryAfterSeconds);
  }

  logger.warn(
    `${operation} rate limited by Stellar RPC (attempt ${attempts}), retrying in ${plan.delayMs}ms`,
  );
  await sleep(plan.delayMs);
}
