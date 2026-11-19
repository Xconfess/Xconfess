import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DataSource } from 'typeorm';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MetricsController } from './metrics.controller';
import { OperationalMetricsService } from './operational-metrics.service';

function dataSourceWithPools(pools: {
  master?: object;
  slaves?: object[];
}): DataSource {
  return { driver: pools } as unknown as DataSource;
}

describe('MetricsController', () => {
  it('returns the Prometheus text from the metrics service', () => {
    const metrics = new OperationalMetricsService();
    metrics.recordFeedQuery('public', 'success', 0.01);
    const controller = new MetricsController(metrics, dataSourceWithPools({}));

    expect(controller.getMetrics()).toContain(
      'xconfess_feed_queries_total{feed_type="public",outcome="success"} 1',
    );
  });

  it('refreshes database pool gauges from the driver on every scrape', () => {
    const metrics = new OperationalMetricsService();
    const controller = new MetricsController(
      metrics,
      dataSourceWithPools({
        master: {
          totalCount: 4,
          idleCount: 1,
          waitingCount: 2,
          options: { max: 10 },
        },
      }),
    );

    expect(controller.getMetrics()).toContain(
      'xconfess_db_pool_connections{pool="primary",state="total"} 4',
    );
    expect(controller.getMetrics()).toContain(
      'xconfess_db_pool_waiting_requests{pool="primary"} 2',
    );
  });

  it('is restricted to authenticated admins', () => {
    const guards: unknown[] = Reflect.getMetadata(
      GUARDS_METADATA,
      MetricsController.prototype.getMetrics,
    );
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, AdminGuard]));
  });
});
