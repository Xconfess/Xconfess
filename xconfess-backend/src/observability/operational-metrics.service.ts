import { Injectable } from '@nestjs/common';
import {
  DB_POOL_LABELS,
  DB_POOL_STATE_LABELS,
  FEED_OUTCOME_LABELS,
  FEED_TYPE_LABELS,
  FeedOutcomeLabel,
  FeedTypeLabel,
  HTTP_METHOD_LABELS,
  ROUTE_CATEGORY_LABELS,
  STATUS_CLASS_LABELS,
  normalizeMethod,
  statusClassOf,
} from './metric-labels';

/** Latency buckets in seconds (5 ms .. 10 s). */
export const LATENCY_BUCKETS_SECONDS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/** Hard ceiling on distinct label combinations per metric (defence in depth). */
export const MAX_SERIES_PER_METRIC = 500;

/** One database connection pool, read from the driver at scrape time. */
export interface DbPoolSnapshot {
  /** Pool role; anything outside DB_POOL_LABELS is collapsed to `other`. */
  pool: string;
  /** Open connections (idle plus checked out). */
  total: number;
  /** Open connections sitting idle in the pool. */
  idle: number;
  /** Callers waiting for a free connection right now. */
  waiting: number;
  /** Configured maximum connections for the pool. */
  max: number;
}

type LabelValues = Record<string, string>;

interface MetricDefinition {
  name: string;
  help: string;
  /** label name -> the ONLY values it may take. Anything else becomes 'other'. */
  allowedLabels: Readonly<Record<string, readonly string[]>>;
}

interface CounterSeries {
  labels: LabelValues;
  value: number;
}

interface HistogramSeries {
  labels: LabelValues;
  bucketCounts: number[];
  sum: number;
  count: number;
}

/**
 * Tiny dependency-free metrics registry that renders Prometheus text format.
 *
 * Privacy design: every label value is validated against a closed allow-list
 * declared next to the metric. Unknown values are collapsed into "other", so
 * user ids, confession ids, emails, tokens or free text can never become a
 * label - even if a caller passes them by mistake.
 */
@Injectable()
export class OperationalMetricsService {
  private readonly httpRequests: MetricDefinition = {
    name: 'xconfess_http_requests_total',
    help: 'Completed HTTP requests by method, safe route category and status class.',
    allowedLabels: {
      method: HTTP_METHOD_LABELS,
      route_category: ROUTE_CATEGORY_LABELS,
      status_class: STATUS_CLASS_LABELS,
    },
  };

  private readonly httpDuration: MetricDefinition = {
    name: 'xconfess_http_request_duration_seconds',
    help: 'HTTP request latency in seconds by method, safe route category and status class.',
    allowedLabels: this.httpRequests.allowedLabels,
  };

  private readonly feedQueries: MetricDefinition = {
    name: 'xconfess_feed_queries_total',
    help: 'Feed/search query executions by feed type and outcome.',
    allowedLabels: {
      feed_type: FEED_TYPE_LABELS,
      outcome: FEED_OUTCOME_LABELS,
    },
  };

  private readonly feedDuration: MetricDefinition = {
    name: 'xconfess_feed_query_duration_seconds',
    help: 'Feed/search query latency in seconds by feed type and outcome (kept separate from general API latency).',
    allowedLabels: this.feedQueries.allowedLabels,
  };

  private readonly dbPoolConnections: MetricDefinition = {
    name: 'xconfess_db_pool_connections',
    help: 'Database connections per pool by state (total, idle, active, max).',
    allowedLabels: {
      pool: DB_POOL_LABELS,
      state: DB_POOL_STATE_LABELS,
    },
  };

  private readonly dbPoolWaiting: MetricDefinition = {
    name: 'xconfess_db_pool_waiting_requests',
    help: 'Requests waiting for a free database connection, per pool.',
    allowedLabels: {
      pool: DB_POOL_LABELS,
    },
  };

  private readonly droppedSeriesDefinition: MetricDefinition = {
    name: 'xconfess_metrics_dropped_series_total',
    help: 'Label combinations dropped because a metric hit its series limit.',
    allowedLabels: {},
  };

  private counters = new Map<string, Map<string, CounterSeries>>();
  private histograms = new Map<string, Map<string, HistogramSeries>>();
  private dbPools = new Map<string, DbPoolSnapshot>();
  private droppedSeries = 0;

  // ---------------------------------------------------------------------------
  // Public emission API
  // ---------------------------------------------------------------------------

  /** Record one completed HTTP request. `routeCategory` must come from categorizeRoute(). */
  recordHttpRequest(input: {
    method: unknown;
    routeCategory: string;
    statusCode: unknown;
    durationSeconds: number;
  }): void {
    const labels: LabelValues = {
      method: normalizeMethod(input.method),
      route_category: String(input.routeCategory),
      status_class: statusClassOf(input.statusCode),
    };
    this.incrementCounter(this.httpRequests, labels);
    this.observeHistogram(this.httpDuration, labels, input.durationSeconds);
  }

  /** Record one feed/search query execution. */
  recordFeedQuery(
    feedType: string,
    outcome: FeedOutcomeLabel,
    durationSeconds: number,
  ): void {
    const labels: LabelValues = { feed_type: String(feedType), outcome };
    this.incrementCounter(this.feedQueries, labels);
    this.observeHistogram(this.feedDuration, labels, durationSeconds);
  }

  /**
   * Time an async feed query. Errors are recorded (outcome="error") and then
   * re-thrown untouched, so behaviour of the wrapped call never changes.
   */
  async observeFeedQuery<T>(
    feedType: FeedTypeLabel,
    run: () => Promise<T>,
  ): Promise<T> {
    const start = process.hrtime.bigint();
    try {
      const result = await run();
      this.recordFeedQuery(feedType, 'success', elapsedSeconds(start));
      return result;
    } catch (error) {
      this.recordFeedQuery(feedType, 'error', elapsedSeconds(start));
      throw error;
    }
  }

  /**
   * Replace the database pool gauges with a fresh reading.
   *
   * Pool names are collapsed to the closed DB_POOL_LABELS set. Entries that
   * share a label (for example two read replicas) are summed, so each label
   * set is emitted exactly once.
   */
  setDbPoolSnapshot(pools: readonly DbPoolSnapshot[]): void {
    const next = new Map<string, DbPoolSnapshot>();
    for (const pool of pools) {
      const known = (DB_POOL_LABELS as readonly string[]).includes(pool.pool);
      const label = known ? pool.pool : 'other';
      const current = next.get(label) ?? {
        pool: label,
        total: 0,
        idle: 0,
        waiting: 0,
        max: 0,
      };
      current.total += nonNegative(pool.total);
      current.idle += nonNegative(pool.idle);
      current.waiting += nonNegative(pool.waiting);
      current.max += nonNegative(pool.max);
      next.set(label, current);
    }
    this.dbPools = next;
  }

  /** Render every metric in Prometheus text exposition format. */
  renderPrometheus(): string {
    const lines: string[] = [];

    for (const def of [this.httpRequests, this.feedQueries]) {
      lines.push(`# HELP ${def.name} ${def.help}`);
      lines.push(`# TYPE ${def.name} counter`);
      for (const series of this.counters.get(def.name)?.values() ?? []) {
        lines.push(`${def.name}${formatLabels(series.labels)} ${series.value}`);
      }
    }

    for (const def of [this.httpDuration, this.feedDuration]) {
      lines.push(`# HELP ${def.name} ${def.help}`);
      lines.push(`# TYPE ${def.name} histogram`);
      for (const series of this.histograms.get(def.name)?.values() ?? []) {
        let cumulative = 0;
        LATENCY_BUCKETS_SECONDS.forEach((bound, index) => {
          cumulative += series.bucketCounts[index];
          lines.push(
            `${def.name}_bucket${formatLabels({ ...series.labels, le: String(bound) })} ${cumulative}`,
          );
        });
        lines.push(
          `${def.name}_bucket${formatLabels({ ...series.labels, le: '+Inf' })} ${series.count}`,
        );
        lines.push(
          `${def.name}_sum${formatLabels(series.labels)} ${series.sum}`,
        );
        lines.push(
          `${def.name}_count${formatLabels(series.labels)} ${series.count}`,
        );
      }
    }

    lines.push(
      `# HELP ${this.dbPoolConnections.name} ${this.dbPoolConnections.help}`,
    );
    lines.push(`# TYPE ${this.dbPoolConnections.name} gauge`);
    for (const pool of this.dbPools.values()) {
      const states: Array<[string, number]> = [
        ['total', pool.total],
        ['idle', pool.idle],
        ['active', Math.max(pool.total - pool.idle, 0)],
        ['max', pool.max],
      ];
      for (const [state, value] of states) {
        lines.push(
          `${this.dbPoolConnections.name}${formatLabels({ pool: pool.pool, state })} ${value}`,
        );
      }
    }

    lines.push(
      `# HELP ${this.dbPoolWaiting.name} ${this.dbPoolWaiting.help}`,
    );
    lines.push(`# TYPE ${this.dbPoolWaiting.name} gauge`);
    for (const pool of this.dbPools.values()) {
      lines.push(
        `${this.dbPoolWaiting.name}${formatLabels({ pool: pool.pool })} ${pool.waiting}`,
      );
    }

    lines.push(
      `# HELP ${this.droppedSeriesDefinition.name} ${this.droppedSeriesDefinition.help}`,
    );
    lines.push(`# TYPE ${this.droppedSeriesDefinition.name} counter`);
    lines.push(`${this.droppedSeriesDefinition.name} ${this.droppedSeries}`);

    return `${lines.join('\n')}\n`;
  }

  /** Clear all recorded values (used by tests). */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.dbPools.clear();
    this.droppedSeries = 0;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private incrementCounter(def: MetricDefinition, raw: LabelValues): void {
    const labels = sanitizeLabels(def, raw);
    const key = seriesKey(labels);
    const table = getOrCreate(this.counters, def.name);
    let series = table.get(key);
    if (!series) {
      if (table.size >= MAX_SERIES_PER_METRIC) {
        this.droppedSeries += 1;
        return;
      }
      series = { labels, value: 0 };
      table.set(key, series);
    }
    series.value += 1;
  }

  private observeHistogram(
    def: MetricDefinition,
    raw: LabelValues,
    durationSeconds: number,
  ): void {
    const labels = sanitizeLabels(def, raw);
    const key = seriesKey(labels);
    const table = getOrCreate(this.histograms, def.name);
    let series = table.get(key);
    if (!series) {
      if (table.size >= MAX_SERIES_PER_METRIC) {
        this.droppedSeries += 1;
        return;
      }
      series = {
        labels,
        bucketCounts: new Array<number>(LATENCY_BUCKETS_SECONDS.length).fill(0),
        sum: 0,
        count: 0,
      };
      table.set(key, series);
    }

    const value =
      Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : 0;
    series.count += 1;
    series.sum += value;
    const bucketIndex = LATENCY_BUCKETS_SECONDS.findIndex(
      (bound) => value <= bound,
    );
    if (bucketIndex >= 0) series.bucketCounts[bucketIndex] += 1;
  }
}

function elapsedSeconds(startNs: bigint): number {
  return Number(process.hrtime.bigint() - startNs) / 1e9;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getOrCreate<V>(
  map: Map<string, Map<string, V>>,
  name: string,
): Map<string, V> {
  let table = map.get(name);
  if (!table) {
    table = new Map<string, V>();
    map.set(name, table);
  }
  return table;
}

/** Keep only declared labels, and collapse any undeclared value to "other". */
function sanitizeLabels(def: MetricDefinition, raw: LabelValues): LabelValues {
  const clean: LabelValues = {};
  for (const [name, allowed] of Object.entries(def.allowedLabels)) {
    const value = raw[name];
    clean[name] = allowed.includes(value) ? value : 'other';
  }
  return clean;
}

function seriesKey(labels: LabelValues): string {
  return Object.keys(labels)
    .sort()
    .map((name) => `${name}=${labels[name]}`)
    .join('|');
}

function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function formatLabels(labels: LabelValues): string {
  const parts = Object.entries(labels).map(
    ([name, value]) => `${name}="${escapeLabelValue(value)}"`,
  );
  return parts.length ? `{${parts.join(',')}}` : '';
}
