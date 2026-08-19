// src/logger/logger.service.ts
import {
  Injectable,
  Logger,
  LoggerService as NestLoggerService,
} from '@nestjs/common';
import { UserIdMasker } from '../utils/mask-user-id';
import { redactSecretsDeep } from '../utils/redact-secrets';

type MetricLabels = Record<string, string | number | boolean>;
type EventSeverity = 'info' | 'warning' | 'alert';

interface StructuredEvent {
  event: string;
  severity: EventSeverity;
  timestamp: string;
  [key: string]: any;
}

interface TimerAggregate {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
}

@Injectable()
export class AppLogger implements NestLoggerService {
  private readonly nestLogger = new Logger('AppLogger');
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly timers = new Map<string, TimerAggregate>();

  // ── Sanitization ─────────────────────────────────────────────────────────────

  private sanitize(message: any): any {
    if (typeof message === 'string')
      return redactSecretsDeep(UserIdMasker.maskObject({ msg: message }).msg);
    if (typeof message === 'object' && message !== null) {
      return redactSecretsDeep(UserIdMasker.maskObject(message));
    }
    return message;
  }

  private formatPrefix(context?: string, requestId?: string): string {
    const parts: string[] = [];
    if (context) parts.push(context);
    if (requestId) parts.push(`req:${requestId}`);
    return parts.length > 0 ? `[${parts.join('][')}]` : '[App]';
  }

  private toLogPayload(message: any, context?: string, requestId?: string) {
    return {
      prefix: this.formatPrefix(context, requestId),
      data: this.sanitize(message),
    };
  }

  // ── NestJS LoggerService interface ───────────────────────────────────────────

  log(message: any, context?: string, requestId?: string) {
    const payload = this.toLogPayload(message, context, requestId);
    this.nestLogger.log(payload, context);
  }

  error(message: any, trace?: string, context?: string, requestId?: string) {
    const payload = this.toLogPayload(message, context, requestId);
    this.nestLogger.error(payload, trace, context);
  }

  warn(message: any, context?: string, requestId?: string) {
    const payload = this.toLogPayload(message, context, requestId);
    this.nestLogger.warn(payload, context);
  }

  debug(message: any, context?: string, requestId?: string) {
    const payload = this.toLogPayload(message, context, requestId);
    this.nestLogger.debug(payload, context);
  }

  verbose(message: any, context?: string, requestId?: string) {
    const payload = this.toLogPayload(message, context, requestId);
    this.nestLogger.verbose(payload, context);
  }

  emitEvent(
    severity: EventSeverity,
    event: string,
    details: Record<string, any>,
    context?: string,
    requestId?: string,
  ) {
    const payload: StructuredEvent = {
      event,
      severity,
      timestamp: new Date().toISOString(),
      ...details,
    };

    if (severity === 'alert') {
      this.error(payload, undefined, context, requestId);
      return;
    }
    if (severity === 'warning') {
      this.warn(payload, context, requestId);
      return;
    }
    this.log(payload, context, requestId);
  }

  emitWarningEvent(
    event: string,
    details: Record<string, any>,
    context?: string,
    requestId?: string,
  ) {
    this.emitEvent('warning', event, details, context, requestId);
  }

  emitAlertEvent(
    event: string,
    details: Record<string, any>,
    context?: string,
    requestId?: string,
  ) {
    this.emitEvent('alert', event, details, context, requestId);
  }

  // ── Contextual helpers ───────────────────────────────────────────────────────

  logWithUser(
    message: string,
    userId: string | number,
    context?: string,
    requestId?: string,
  ) {
    const maskedId = UserIdMasker.mask(userId);
    this.log(`${message} [${maskedId}]`, context, requestId);
  }

  errorWithUser(
    message: string,
    userId: string | number,
    trace?: string,
    context?: string,
    requestId?: string,
  ) {
    const maskedId = UserIdMasker.mask(userId);
    this.error(`${message} [${maskedId}]`, trace, context, requestId);
  }

  logWithRequestId(message: string, requestId: string, context?: string) {
    this.log(message, context, requestId);
  }

  errorWithRequestId(
    message: string,
    requestId: string,
    trace?: string,
    context?: string,
  ) {
    this.error(message, trace, context, requestId);
  }

  // ── Metrics ──────────────────────────────────────────────────────────────────

  private normalizeLabelValue(value: string | number | boolean): string {
    return String(value);
  }

  private serializeLabels(labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) return '';
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${this.normalizeLabelValue(value)}`)
      .join(',');
  }

  private metricKey(name: string, labels?: MetricLabels): string {
    const serializedLabels = this.serializeLabels(labels);
    return serializedLabels ? `${name}|${serializedLabels}` : name;
  }

  incrementCounter(name: string, value = 1, labels?: MetricLabels): number {
    const key = this.metricKey(name, labels);
    const next = (this.counters.get(key) ?? 0) + value;
    this.counters.set(key, next);
    return next;
  }

  setGauge(name: string, value: number, labels?: MetricLabels): number {
    const key = this.metricKey(name, labels);
    this.gauges.set(key, value);
    return value;
  }

  observeTimer(
    name: string,
    durationMs: number,
    labels?: MetricLabels,
  ): TimerAggregate {
    const key = this.metricKey(name, labels);
    const current = this.timers.get(key);

    const next: TimerAggregate = current
      ? {
          count: current.count + 1,
          totalMs: current.totalMs + durationMs,
          minMs: Math.min(current.minMs, durationMs),
          maxMs: Math.max(current.maxMs, durationMs),
          lastMs: durationMs,
        }
      : {
          count: 1,
          totalMs: durationMs,
          minMs: durationMs,
          maxMs: durationMs,
          lastMs: durationMs,
        };

    this.timers.set(key, next);
    return next;
  }

  /**
   * Emit a structured warning when a search query exceeds the configured slow-query
   * threshold. Sensitive terms are redacted before logging; enough metadata is
   * retained for query-shape diagnosis (term length, word count, filter shape,
   * pagination, and result count).
   *
   * @param opts.durationMs  Wall-clock time the repository call took.
   * @param opts.rawTerm     The original search term (will be redacted in the log).
   * @param opts.searchType  'fulltext' | 'hybrid' | 'ilike' – the strategy used.
   * @param opts.page        Requested page number.
   * @param opts.limit       Page size requested.
   * @param opts.resultCount Number of rows returned.
   * @param opts.thresholdMs The configured latency threshold.
   * @param opts.filters     Optional free-form filter shape descriptor.
   */
  logSlowSearch(opts: {
    durationMs: number;
    rawTerm: string;
    searchType: 'fulltext' | 'hybrid' | 'ilike';
    page: number;
    limit: number;
    resultCount: number;
    thresholdMs: number;
    filters?: Record<string, unknown>;
  }): void {
    const redactedTerm = `[REDACTED:len=${opts.rawTerm.length},words=${opts.rawTerm.trim().split(/\s+/).filter(Boolean).length}]`;

    this.emitWarningEvent(
      'search.slow_query',
      {
        durationMs: opts.durationMs,
        thresholdMs: opts.thresholdMs,
        searchType: opts.searchType,
        termShape: redactedTerm,
        page: opts.page,
        limit: opts.limit,
        resultCount: opts.resultCount,
        filters: opts.filters ?? {},
      },
      'SearchObservability',
    );
  }

  /**
   * Emit a structured info log for a sampled (non-slow) search query.
   * Same redaction rules apply.
   */
  logSampledSearch(opts: {
    durationMs: number;
    rawTerm: string;
    searchType: 'fulltext' | 'hybrid' | 'ilike';
    page: number;
    limit: number;
    resultCount: number;
    filters?: Record<string, unknown>;
  }): void {
    const redactedTerm = `[REDACTED:len=${opts.rawTerm.length},words=${opts.rawTerm.trim().split(/\s+/).filter(Boolean).length}]`;

    this.emitEvent(
      'info',
      'search.sampled_query',
      {
        durationMs: opts.durationMs,
        searchType: opts.searchType,
        termShape: redactedTerm,
        page: opts.page,
        limit: opts.limit,
        resultCount: opts.resultCount,
        filters: opts.filters ?? {},
      },
      'SearchObservability',
    );
  }

  getMetricsSnapshot() {
    const parseMetric = (key: string) => {
      const [name, rawLabels] = key.split('|');
      const labels: Record<string, string> = {};
      if (rawLabels) {
        rawLabels.split(',').forEach((pair) => {
          const [k, v] = pair.split('=');
          if (k && v !== undefined) labels[k] = v;
        });
      }
      return { name, labels };
    };

    return {
      counters: Array.from(this.counters.entries()).map(([key, value]) => ({
        ...parseMetric(key),
        value,
        type: 'counter' as const,
      })),
      gauges: Array.from(this.gauges.entries()).map(([key, value]) => ({
        ...parseMetric(key),
        value,
        type: 'gauge' as const,
      })),
      timers: Array.from(this.timers.entries()).map(([key, value]) => ({
        ...parseMetric(key),
        ...value,
        avgMs: value.count > 0 ? value.totalMs / value.count : 0,
        type: 'timer' as const,
      })),
    };
  }
}
