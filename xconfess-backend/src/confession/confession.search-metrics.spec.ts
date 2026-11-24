import { RequestTimeoutException } from '@nestjs/common';
import { ConfessionService } from './confession.service';
import { OperationalMetricsService } from '../observability/operational-metrics.service';
import { classifySearchQueryError } from './search-query-timeout';

/** Builds the service without its dependencies; only the metric wrapper runs. */
function makeService(metrics?: OperationalMetricsService): any {
  const service: any = Object.create(ConfessionService.prototype);
  service.operationalMetrics = metrics;
  service.runSearch = jest.fn().mockResolvedValue({ data: [] });
  service.runFullTextSearch = jest.fn().mockResolvedValue({ data: [] });
  return service;
}

describe('classifySearchQueryError', () => {
  it('classifies statement timeouts', () => {
    expect(classifySearchQueryError({ code: '57014' })).toBe('timeout');
    expect(
      classifySearchQueryError(
        new Error('canceling statement due to statement timeout'),
      ),
    ).toBe('timeout');
  });

  it('classifies the mapped 408 SEARCH_TIMEOUT response as a timeout', () => {
    const mapped = new RequestTimeoutException({ code: 'SEARCH_TIMEOUT' });
    expect(classifySearchQueryError(mapped)).toBe('timeout');
  });

  it('classifies caller aborts and user-requested cancels as cancelled', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(classifySearchQueryError(abort)).toBe('cancelled');
    expect(classifySearchQueryError({ code: 'ABORT_ERR' })).toBe('cancelled');
    expect(
      classifySearchQueryError({
        code: '57014',
        message: 'canceling statement due to user request',
      }),
    ).toBe('cancelled');
  });

  it('falls back to error for everything else', () => {
    expect(classifySearchQueryError(new Error('connection reset'))).toBe(
      'error',
    );
    expect(classifySearchQueryError(null)).toBe('error');
    expect(classifySearchQueryError('boom')).toBe('error');
  });
});

describe('ConfessionService search metrics (#2395)', () => {
  let metrics: OperationalMetricsService;

  beforeEach(() => {
    metrics = new OperationalMetricsService();
  });

  it.each([
    ['search', 'search'],
    ['fullTextSearch', 'fulltext_search'],
  ])('%s counts a successful query with route=%s', async (method, route) => {
    const service = makeService(metrics);
    await service[method]({ q: 'hello' });

    const text = metrics.renderPrometheus();
    expect(text).toContain(
      `xconfess_search_queries_total{route="${route}",outcome="success"} 1`,
    );
    expect(text).toContain(
      `xconfess_search_query_duration_seconds_count{route="${route}",outcome="success"} 1`,
    );
  });

  it('counts timeouts and preserves the original error', async () => {
    const service = makeService(metrics);
    const timeout = new RequestTimeoutException({ code: 'SEARCH_TIMEOUT' });
    service.runSearch.mockRejectedValue(timeout);

    await expect(service.search({ q: 'slow' })).rejects.toBe(timeout);
    expect(metrics.renderPrometheus()).toContain(
      'xconfess_search_queries_total{route="search",outcome="timeout"} 1',
    );
  });

  it('counts cancellations', async () => {
    const service = makeService(metrics);
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    service.runFullTextSearch.mockRejectedValue(abort);

    await expect(service.fullTextSearch({ q: 'gone' })).rejects.toBe(abort);
    expect(metrics.renderPrometheus()).toContain(
      'xconfess_search_queries_total{route="fulltext_search",outcome="cancelled"} 1',
    );
  });

  it('counts unexpected failures as error', async () => {
    const service = makeService(metrics);
    service.runSearch.mockRejectedValue(new Error('db down'));

    await expect(service.search({ q: 'x' })).rejects.toThrow('db down');
    expect(metrics.renderPrometheus()).toContain(
      'xconfess_search_queries_total{route="search",outcome="error"} 1',
    );
  });

  it('never exposes search terms or confession content in metric output', async () => {
    const service = makeService(metrics);
    service.runSearch.mockResolvedValue({
      data: [{ message: 'my deepest secret confession' }],
    });
    await service.search({ q: 'my private search term' });
    service.runFullTextSearch.mockRejectedValue(
      new Error('statement timeout while searching my private search term'),
    );
    await service
      .fullTextSearch({ q: 'my private search term' })
      .catch(() => 0);

    const text = metrics.renderPrometheus();
    expect(text).not.toContain('private search term');
    expect(text).not.toContain('deepest secret');
    const searchLines = text
      .split('\n')
      .filter((line) => line.startsWith('xconfess_search_'));
    for (const line of searchLines.filter((l) => !l.startsWith('#'))) {
      expect(line).toMatch(/^[a-z_]+\{route="[a-z_]+",outcome="[a-z]+"/);
    }
  });

  it('still works when the metrics service is not available', async () => {
    const service = makeService(undefined);
    await expect(service.search({ q: 'x' })).resolves.toEqual({ data: [] });
  });
});
