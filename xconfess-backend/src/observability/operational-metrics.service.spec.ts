import {
  LATENCY_BUCKETS_SECONDS,
  MAX_SERIES_PER_METRIC,
  OperationalMetricsService,
} from './operational-metrics.service';

const UUID = '3f2b8c1e-1111-4222-8333-444455556666';

function lines(service: OperationalMetricsService): string[] {
  return service.renderPrometheus().split('\n');
}

describe('OperationalMetricsService', () => {
  let service: OperationalMetricsService;

  beforeEach(() => {
    service = new OperationalMetricsService();
  });

  describe('HTTP metrics', () => {
    it('emits request count and latency by safe route category and status class', () => {
      service.recordHttpRequest({
        method: 'GET',
        routeCategory: 'confessions_feed',
        statusCode: 200,
        durationSeconds: 0.03,
      });
      service.recordHttpRequest({
        method: 'GET',
        routeCategory: 'confessions_feed',
        statusCode: 200,
        durationSeconds: 0.3,
      });
      service.recordHttpRequest({
        method: 'POST',
        routeCategory: 'auth',
        statusCode: 401,
        durationSeconds: 0.004,
      });

      const out = lines(service);
      expect(out).toContain(
        'xconfess_http_requests_total{method="GET",route_category="confessions_feed",status_class="2xx"} 2',
      );
      expect(out).toContain(
        'xconfess_http_requests_total{method="POST",route_category="auth",status_class="4xx"} 1',
      );
      expect(out).toContain(
        'xconfess_http_request_duration_seconds_count{method="GET",route_category="confessions_feed",status_class="2xx"} 2',
      );
      // 0.03s falls in the 0.05 bucket, 0.3s in the 0.5 bucket (cumulative).
      expect(out).toContain(
        'xconfess_http_request_duration_seconds_bucket{method="GET",route_category="confessions_feed",status_class="2xx",le="0.025"} 0',
      );
      expect(out).toContain(
        'xconfess_http_request_duration_seconds_bucket{method="GET",route_category="confessions_feed",status_class="2xx",le="0.05"} 1',
      );
      expect(out).toContain(
        'xconfess_http_request_duration_seconds_bucket{method="GET",route_category="confessions_feed",status_class="2xx",le="0.5"} 2',
      );
      expect(out).toContain(
        'xconfess_http_request_duration_seconds_bucket{method="GET",route_category="confessions_feed",status_class="2xx",le="+Inf"} 2',
      );
    });

    it('tracks 5xx errors separately from successes', () => {
      service.recordHttpRequest({
        method: 'GET',
        routeCategory: 'confessions_feed',
        statusCode: 500,
        durationSeconds: 0.1,
      });
      expect(lines(service)).toContain(
        'xconfess_http_requests_total{method="GET",route_category="confessions_feed",status_class="5xx"} 1',
      );
    });

    it('accumulates the latency sum', () => {
      service.recordHttpRequest({
        method: 'GET',
        routeCategory: 'health',
        statusCode: 200,
        durationSeconds: 0.25,
      });
      service.recordHttpRequest({
        method: 'GET',
        routeCategory: 'health',
        statusCode: 200,
        durationSeconds: 0.25,
      });
      expect(lines(service)).toContain(
        'xconfess_http_request_duration_seconds_sum{method="GET",route_category="health",status_class="2xx"} 0.5',
      );
    });

    it('ignores invalid durations instead of corrupting the histogram', () => {
      service.recordHttpRequest({
        method: 'GET',
        routeCategory: 'health',
        statusCode: 200,
        durationSeconds: Number.NaN,
      });
      const out = lines(service);
      expect(out.join('\n')).not.toContain('NaN');
      expect(out).toContain(
        'xconfess_http_request_duration_seconds_sum{method="GET",route_category="health",status_class="2xx"} 0',
      );
    });
  });

  describe('feed metrics', () => {
    it('emits feed latency separately from general API latency', () => {
      service.recordFeedQuery('public', 'success', 0.02);
      const text = service.renderPrometheus();
      expect(text).toContain(
        'xconfess_feed_queries_total{feed_type="public",outcome="success"} 1',
      );
      expect(text).toContain(
        'xconfess_feed_query_duration_seconds_count{feed_type="public",outcome="success"} 1',
      );
      // Recording a feed query must not create an HTTP series.
      expect(text).not.toMatch(/xconfess_http_requests_total\{/);
    });

    it('observeFeedQuery records success and returns the result', async () => {
      const result = await service.observeFeedQuery('search', async () => 'ok');
      expect(result).toBe('ok');
      expect(lines(service)).toContain(
        'xconfess_feed_queries_total{feed_type="search",outcome="success"} 1',
      );
    });

    it('observeFeedQuery records errors and re-throws the original error', async () => {
      const boom = new Error('db down');
      await expect(
        service.observeFeedQuery('trending', async () => {
          throw boom;
        }),
      ).rejects.toBe(boom);
      expect(lines(service)).toContain(
        'xconfess_feed_queries_total{feed_type="trending",outcome="error"} 1',
      );
    });
  });

  describe('database pool metrics', () => {
    it('emits connection counts per pool and state, plus the waiting queue', () => {
      service.setDbPoolSnapshot([
        { pool: 'primary', total: 6, idle: 2, waiting: 3, max: 10 },
      ]);

      const out = lines(service);
      expect(out).toContain('# TYPE xconfess_db_pool_connections gauge');
      expect(out).toContain(
        'xconfess_db_pool_connections{pool="primary",state="total"} 6',
      );
      expect(out).toContain(
        'xconfess_db_pool_connections{pool="primary",state="idle"} 2',
      );
      expect(out).toContain(
        'xconfess_db_pool_connections{pool="primary",state="active"} 4',
      );
      expect(out).toContain(
        'xconfess_db_pool_connections{pool="primary",state="max"} 10',
      );
      expect(out).toContain('# TYPE xconfess_db_pool_waiting_requests gauge');
      expect(out).toContain(
        'xconfess_db_pool_waiting_requests{pool="primary"} 3',
      );
    });

    it('sums replicas into one series so each label set appears once', () => {
      service.setDbPoolSnapshot([
        { pool: 'replica', total: 2, idle: 1, waiting: 0, max: 5 },
        { pool: 'replica', total: 3, idle: 3, waiting: 1, max: 5 },
      ]);

      const out = lines(service);
      expect(out).toContain(
        'xconfess_db_pool_connections{pool="replica",state="total"} 5',
      );
      expect(out).toContain(
        'xconfess_db_pool_connections{pool="replica",state="max"} 10',
      );
      expect(out).toContain(
        'xconfess_db_pool_waiting_requests{pool="replica"} 1',
      );
      expect(
        out.filter((line) =>
          line.startsWith(
            'xconfess_db_pool_connections{pool="replica",state="total"}',
          ),
        ),
      ).toHaveLength(1);
    });

    it('collapses unknown pool names and never echoes them', () => {
      service.setDbPoolSnapshot([
        { pool: 'user-42@example.com', total: 1, idle: 1, waiting: 0, max: 1 },
      ]);

      const output = service.renderPrometheus();
      expect(output).toContain(
        'xconfess_db_pool_connections{pool="other",state="total"} 1',
      );
      expect(output).not.toContain('example.com');
      expect(output).not.toContain('user-42');
    });

    it('replaces the previous reading instead of accumulating', () => {
      service.setDbPoolSnapshot([
        { pool: 'primary', total: 9, idle: 0, waiting: 0, max: 10 },
      ]);
      service.setDbPoolSnapshot([
        { pool: 'primary', total: 2, idle: 2, waiting: 0, max: 10 },
      ]);

      expect(lines(service)).toContain(
        'xconfess_db_pool_connections{pool="primary",state="total"} 2',
      );
    });

    it('treats negative or non-finite readings as zero', () => {
      service.setDbPoolSnapshot([
        {
          pool: 'primary',
          total: Number.NaN,
          idle: -1,
          waiting: Infinity,
          max: 4,
        },
      ]);

      const out = lines(service);
      expect(out).toContain(
        'xconfess_db_pool_connections{pool="primary",state="total"} 0',
      );
      expect(out).toContain(
        'xconfess_db_pool_waiting_requests{pool="primary"} 0',
      );
    });

    it('only uses the documented pool and state label names', () => {
      service.setDbPoolSnapshot([
        { pool: 'primary', total: 1, idle: 0, waiting: 0, max: 1 },
      ]);

      const labelNames = [
        ...service.renderPrometheus().matchAll(/([a-z_]+)="/g),
      ].map((match) => match[1]);
      const allowed = ['pool', 'state', 'le'];
      expect(labelNames).toEqual(expect.arrayContaining(['pool', 'state']));
      for (const name of labelNames) {
        expect(allowed).toContain(name);
      }
    });
  });

  describe('privacy constraints', () => {
    it('collapses unknown label values into "other" so identifiers cannot leak', () => {
      service.recordHttpRequest({
        method: `GET-${UUID}`,
        routeCategory: `/api/confessions/${UUID}`,
        statusCode: 200,
        durationSeconds: 0.01,
      });
      service.recordFeedQuery(`user-${UUID}`, 'success', 0.01);

      const text = service.renderPrometheus();
      expect(text).not.toContain(UUID);
      expect(text).toContain(
        'xconfess_http_requests_total{method="OTHER",route_category="other",status_class="2xx"} 1',
      );
      expect(text).toContain(
        'xconfess_feed_queries_total{feed_type="other",outcome="success"} 1',
      );
    });

    it('never emits emails, tokens or confession text, whatever the caller passes', () => {
      const hostile = [
        'alice@example.com',
        'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
        'I secretly enjoy watching reality TV',
        '192.168.0.10',
      ];
      for (const value of hostile) {
        service.recordHttpRequest({
          method: value,
          routeCategory: value,
          statusCode: 200,
          durationSeconds: 0.01,
        });
        service.recordFeedQuery(value, 'success', 0.01);
      }
      const text = service.renderPrometheus();
      for (const value of hostile) {
        expect(text).not.toContain(value);
      }
    });

    it('only ever exposes the documented label names', () => {
      service.recordHttpRequest({
        method: 'GET',
        routeCategory: 'confessions_feed',
        statusCode: 200,
        durationSeconds: 0.01,
      });
      service.recordFeedQuery('public', 'success', 0.01);

      const allowed = new Set([
        'method',
        'route_category',
        'status_class',
        'feed_type',
        'outcome',
        'le',
      ]);
      const labelNames = [
        ...service.renderPrometheus().matchAll(/([a-z_]+)="/g),
      ].map((match) => match[1]);
      expect(labelNames.length).toBeGreaterThan(0);
      for (const name of labelNames) {
        expect(allowed.has(name)).toBe(true);
      }
    });

    it('caps the number of series per metric', () => {
      const anyService = service as any;
      const def = anyService.httpRequests;
      // Force-fill the table to the cap with synthetic distinct keys.
      const table = new Map();
      for (let i = 0; i < MAX_SERIES_PER_METRIC; i++) {
        table.set(`k${i}`, { labels: {}, value: 1 });
      }
      anyService.counters.set(def.name, table);

      service.recordHttpRequest({
        method: 'GET',
        routeCategory: 'health',
        statusCode: 200,
        durationSeconds: 0.01,
      });

      expect(table.size).toBe(MAX_SERIES_PER_METRIC);
      expect(lines(service)).toContain(
        'xconfess_metrics_dropped_series_total 1',
      );
    });
  });

  describe('exposition format', () => {
    it('renders HELP and TYPE headers and ends with a newline', () => {
      const text = service.renderPrometheus();
      expect(text).toContain('# TYPE xconfess_http_requests_total counter');
      expect(text).toContain(
        '# TYPE xconfess_http_request_duration_seconds histogram',
      );
      expect(text).toContain('# TYPE xconfess_feed_queries_total counter');
      expect(text).toContain(
        '# TYPE xconfess_feed_query_duration_seconds histogram',
      );
      expect(text.endsWith('\n')).toBe(true);
    });

    it('declares a bucket for every configured boundary plus +Inf', () => {
      service.recordFeedQuery('public', 'success', 0.01);
      const buckets = lines(service).filter((line) =>
        line.startsWith('xconfess_feed_query_duration_seconds_bucket'),
      );
      expect(buckets).toHaveLength(LATENCY_BUCKETS_SECONDS.length + 1);
    });

    it('reset() clears recorded values', () => {
      service.recordFeedQuery('public', 'success', 0.01);
      service.reset();
      expect(service.renderPrometheus()).not.toContain('feed_type="public"');
    });
  });
});
