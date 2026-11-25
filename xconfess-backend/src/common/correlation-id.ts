import { randomUUID } from 'node:crypto';

/**
 * Issue #2126: a shared helper that every BullMQ job uses to carry a
 * correlation ID from enqueue through success and failure logs. The
 * correlation ID is stable per job and is never derived from user
 * content or secrets - the only sources are the originating request
 * ID (safe: already an opaque identifier at the HTTP boundary) and a
 * fresh UUID. Nothing in the payload itself ends up on this field.
 *
 * Notifications and data-export already propagate a `requestId`-shape
 * correlation ID through their job data; the helper formalises the
 * same shape so a new worker can reach for one utility instead of
 * reinventing the field name and the fallback rule.
 */

/** The property name every queue uses on its job data. */
export const CORRELATION_ID_FIELD = 'correlationId' as const;

/**
 * Minimum shape a job payload needs for the helper to work: it must
 * accept a string `correlationId`. Existing payloads already using
 * `requestId` extend this at the call site rather than being renamed,
 * so the helper is additive.
 */
export interface JobDataWithCorrelation {
  [CORRELATION_ID_FIELD]?: string;
  [key: string]: unknown;
}

/**
 * Chooses an upstream correlation id when one is present, otherwise
 * mints a fresh one. The precedence is:
 *   - the explicit `upstreamId` the caller passed (HTTP request id,
 *     scheduler id, parent job id);
 *   - a UUID v4.
 * Empty and whitespace-only inputs are ignored so a bad upstream
 * cannot smuggle an empty id through logs.
 */
export function resolveCorrelationId(upstreamId?: string | null): string {
  if (typeof upstreamId === 'string') {
    const trimmed = upstreamId.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return randomUUID();
}

/**
 * Non-destructively adds a correlation id to a payload. Existing
 * correlation ids are preserved so a retry keeps the original id
 * through every attempt - the same guarantee BullMQ gives for its
 * own `job.id`.
 */
export function withCorrelationId<T extends JobDataWithCorrelation>(
  data: T,
  upstreamId?: string | null,
): T & { [CORRELATION_ID_FIELD]: string } {
  if (typeof data[CORRELATION_ID_FIELD] === 'string' && data[CORRELATION_ID_FIELD].length > 0) {
    return data as T & { [CORRELATION_ID_FIELD]: string };
  }
  return {
    ...data,
    [CORRELATION_ID_FIELD]: resolveCorrelationId(upstreamId),
  };
}

/** Reads the correlation id off a job payload, or undefined when absent. */
export function readCorrelationId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>)[CORRELATION_ID_FIELD];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Formats the correlation id for a log line. Returns an empty string
 * when the id is missing, so a logger can always string-concatenate
 * the result without a nullish check.
 */
export function correlationLogTag(data: unknown): string {
  const id = readCorrelationId(data);
  return id ? ` correlationId=${id}` : '';
}
