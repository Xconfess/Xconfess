import { ConfessionService } from './confession.service';
import { OperationalMetricsService } from '../observability/operational-metrics.service';

/**
 * Lightweight wiring tests: they build the service without its (many)
 * dependencies and stub the private loaders, so only the metric wrapper is
 * under test.
 */
function makeService(metrics?: OperationalMetricsService): any {
  const service: any = Object.create(ConfessionService.prototype);
  service.operationalMetrics = metrics;
  service.loadConfessionsFeed = jest.fn().mockResolvedValue({ data: [] });
  service.runSearch = jest.fn().mockResolvedValue({ data: [] });
  service.runFullTextSearch = jest.fn().mockResolvedValue({ data: [] });
  service.loadTrendingConfessions = jest.fn().mockResolvedValue([]);
  service.loadConfessionsByTag = jest.fn().mockResolvedValue({ data: [] });
  return service;
}

describe('ConfessionService feed metrics', () => {
  let metrics: OperationalMetricsService;

  beforeEach(() => {
    metrics = new OperationalMetricsService();
  });

  it.each([
    ['getConfessions', [{}], 'public'],
    ['search', [{ q: 'secret words' }], 'search'],
    ['fullTextSearch', [{ q: 'secret words' }], 'fulltext_search'],
    ['getTrendingConfessions', ['24h'], 'trending'],
    ['getConfessionsByTag', ['love', {}], 'tag'],
  ])(
    '%s emits a feed query metric with feed_type=%s',
    async (method, args, feedType) => {
      const service = makeService(metrics);
      await service[method](...args);

      const text = metrics.renderPrometheus();
      expect(text).toContain(
        `xconfess_feed_queries_total{feed_type="${feedType}",outcome="success"} 1`,
      );
    },
  );

  it('never puts search terms or tag names into metric output', async () => {
    const service = makeService(metrics);
    await service.search({ q: 'my secret confession' });
    await service.getConfessionsByTag('private-tag', {});

    const text = metrics.renderPrometheus();
    expect(text).not.toContain('my secret confession');
    expect(text).not.toContain('private-tag');
  });

  it('records error outcome and preserves the original error', async () => {
    const service = makeService(metrics);
    const boom = new Error('query failed');
    service.loadConfessionsFeed.mockRejectedValue(boom);

    await expect(service.getConfessions({})).rejects.toBe(boom);
    expect(metrics.renderPrometheus()).toContain(
      'xconfess_feed_queries_total{feed_type="public",outcome="error"} 1',
    );
  });

  it('keeps feed latency out of the HTTP request series', async () => {
    const service = makeService(metrics);
    await service.getConfessions({});
    expect(metrics.renderPrometheus()).not.toMatch(
      /xconfess_http_requests_total\{/,
    );
  });

  it('still works when the metrics service is not available', async () => {
    const service = makeService(undefined);
    await expect(service.getConfessions({})).resolves.toEqual({ data: [] });
    expect(service.loadConfessionsFeed).toHaveBeenCalledTimes(1);
  });
});
