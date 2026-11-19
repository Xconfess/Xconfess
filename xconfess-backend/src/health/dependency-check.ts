/**
 * Shared response contract for every readiness dependency check
 * (database, Redis, queues, schema).
 *
 * Each Terminus indicator returns `{ [key]: DependencyCheckDetail }`. The
 * envelope fields below are always present so dashboards and deploy tooling
 * can read every dependency the same way; dependency-specific values live
 * under `details`.
 *
 * See HEALTH_CHECK_DOCUMENTATION.md ("Dependency response shape").
 */

export type DependencyName = 'database' | 'redis' | 'queues' | 'schema';

/**
 * - `up`        dependency answered within its timeout and is healthy
 * - `degraded`  dependency answered but is slow or reports a warning
 * - `down`      dependency failed, timed out, or is misconfigured
 * - `disabled`  dependency is intentionally switched off by configuration
 */
export type DependencyState = 'up' | 'degraded' | 'down' | 'disabled';

export type DependencyErrorCode =
  | 'TIMEOUT'
  | 'CONNECTION_REFUSED'
  | 'AUTH_FAILED'
  | 'DNS_LOOKUP_FAILED'
  | 'RESOURCE_EXHAUSTED'
  | 'TLS_FAILED'
  | 'SCHEMA_DRIFT'
  | 'PENDING_MIGRATIONS'
  | 'QUERY_FAILED'
  | 'UNHEALTHY'
  | 'UNKNOWN';

export interface DependencyCheckDetail {
  /** Terminus-compatible status. `disabled` and `degraded` map to `up`. */
  status: 'up' | 'down';
  /** Fine-grained state used by dashboards and the subsystem summary. */
  state: DependencyState;
  dependency: DependencyName;
  /** Critical dependencies (database, schema) make the service unready. */
  critical: boolean;
  /** Round-trip time of the check, or null when it did not complete. */
  latencyMs: number | null;
  /** The bound applied to this check. */
  timeoutMs: number;
  checkedAt: string;
  /** Short, secret-free summary. */
  message: string;
  /** Present when state is `down` or `degraded`. */
  errorCode?: DependencyErrorCode;
  /** Actionable next step for operators. Never contains secrets. */
  hint?: string;
  /** Dependency-specific diagnostics (versions, counts, missing objects). */
  details: Record<string, unknown>;
}

export const DEFAULT_DEPENDENCY_TIMEOUT_MS = 3000;
export const MIN_DEPENDENCY_TIMEOUT_MS = 100;
export const MAX_DEPENDENCY_TIMEOUT_MS = 30_000;

const CRITICAL_DEPENDENCIES: ReadonlySet<DependencyName> = new Set([
  'database',
  'schema',
]);

export function isCriticalDependency(dependency: DependencyName): boolean {
  return CRITICAL_DEPENDENCIES.has(dependency);
}

interface ConfigReader {
  get<T = unknown>(key: string): T | undefined;
}

function parseTimeout(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/**
 * Resolve the timeout for one dependency.
 *
 * Precedence: `HEALTH_<DEPENDENCY>_TIMEOUT_MS`, then `HEALTH_CHECK_TIMEOUT_MS`,
 * then {@link DEFAULT_DEPENDENCY_TIMEOUT_MS}. The result is always clamped to
 * [{@link MIN_DEPENDENCY_TIMEOUT_MS}, {@link MAX_DEPENDENCY_TIMEOUT_MS}] so a
 * typo cannot make a readiness probe hang or fail instantly.
 */
export function resolveDependencyTimeoutMs(
  config: ConfigReader | undefined,
  dependency: DependencyName,
): number {
  const specific = parseTimeout(
    config?.get(`HEALTH_${dependency.toUpperCase()}_TIMEOUT_MS`),
  );
  const shared = parseTimeout(config?.get('HEALTH_CHECK_TIMEOUT_MS'));
  const value = specific ?? shared ?? DEFAULT_DEPENDENCY_TIMEOUT_MS;
  return Math.min(
    MAX_DEPENDENCY_TIMEOUT_MS,
    Math.max(MIN_DEPENDENCY_TIMEOUT_MS, Math.round(value)),
  );
}

export class DependencyTimeoutError extends Error {
  readonly code = 'TIMEOUT' as const;

  constructor(
    readonly dependency: DependencyName,
    readonly timeoutMs: number,
  ) {
    super(`${dependency} check exceeded ${timeoutMs}ms`);
    this.name = 'DependencyTimeoutError';
  }
}

/**
 * Run `operation` but give up after `timeoutMs`. The timer is always cleared
 * so a finished check never leaves an open handle behind.
 */
export async function withDependencyTimeout<T>(
  dependency: DependencyName,
  timeoutMs: number,
  operation: () => Promise<T>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DependencyTimeoutError(dependency, timeoutMs)),
      timeoutMs,
    );
    timer.unref?.();
  });

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Map a raw driver error to a stable, secret-free code. */
export function classifyDependencyError(error: unknown): DependencyErrorCode {
  if (error instanceof DependencyTimeoutError) return 'TIMEOUT';
  const message = (
    error instanceof Error ? error.message : String(error ?? '')
  ).toLowerCase();

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'TIMEOUT';
  }
  if (message.includes('econnrefused') || message.includes('connection refused')) {
    return 'CONNECTION_REFUSED';
  }
  if (message.includes('enotfound') || message.includes('eai_again')) {
    return 'DNS_LOOKUP_FAILED';
  }
  if (
    message.includes('password authentication failed') ||
    message.includes('noauth') ||
    message.includes('wrongpass') ||
    message.includes('authentication')
  ) {
    return 'AUTH_FAILED';
  }
  if (
    message.includes('too many connections') ||
    message.includes('remaining connection slots')
  ) {
    return 'RESOURCE_EXHAUSTED';
  }
  if (message.includes('ssl') || message.includes('tls')) {
    return 'TLS_FAILED';
  }
  return 'UNKNOWN';
}

const ERROR_SUMMARIES: Record<DependencyErrorCode, string> = {
  TIMEOUT: 'check timed out',
  CONNECTION_REFUSED: 'connection refused',
  AUTH_FAILED: 'authentication failed',
  DNS_LOOKUP_FAILED: 'host could not be resolved',
  RESOURCE_EXHAUSTED: 'connection limit reached',
  TLS_FAILED: 'TLS negotiation failed',
  SCHEMA_DRIFT: 'schema is out of sync with migrations',
  PENDING_MIGRATIONS: 'required migrations are pending',
  QUERY_FAILED: 'diagnostic query failed',
  UNHEALTHY: 'dependency reported an unhealthy state',
  UNKNOWN: 'check failed',
};

/** Fixed human summary for an error code — never echoes driver output. */
export function summarizeDependencyError(code: DependencyErrorCode): string {
  return ERROR_SUMMARIES[code];
}

export interface DependencyDetailInput {
  dependency: DependencyName;
  state: DependencyState;
  timeoutMs: number;
  latencyMs?: number | null;
  message: string;
  errorCode?: DependencyErrorCode;
  hint?: string;
  details?: Record<string, unknown>;
  /**
   * Force the Terminus status to `down` (e.g. a degraded dependency that is
   * still allowed to fail readiness). Defaults to `state === 'down'`.
   */
  failsReadiness?: boolean;
  now?: Date;
}

export function buildDependencyDetail(
  input: DependencyDetailInput,
): DependencyCheckDetail {
  const detail: DependencyCheckDetail = {
    status:
      (input.failsReadiness ?? input.state === 'down') ? 'down' : 'up',
    state: input.state,
    dependency: input.dependency,
    critical: isCriticalDependency(input.dependency),
    latencyMs: input.latencyMs ?? null,
    timeoutMs: input.timeoutMs,
    checkedAt: (input.now ?? new Date()).toISOString(),
    message: input.message,
    details: input.details ?? {},
  };
  if (input.errorCode) detail.errorCode = input.errorCode;
  if (input.hint) detail.hint = input.hint;
  return detail;
}

/** Reasons operators see when background jobs (Redis, queues) are off. */
export function resolveBackgroundJobsDisabledReason(rawValue: unknown): string {
  if (rawValue === 'false') {
    return 'ENABLE_BACKGROUND_JOBS is set to "false" (background jobs intentionally disabled)';
  }
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 'ENABLE_BACKGROUND_JOBS is not set (defaults to disabled)';
  }
  return `ENABLE_BACKGROUND_JOBS is set to "${String(rawValue)}" (expected "true" to enable)`;
}
