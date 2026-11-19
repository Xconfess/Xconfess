import { Global, Module } from '@nestjs/common';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsController } from './metrics.controller';
import { OperationalMetricsService } from './operational-metrics.service';

/**
 * Global so feature modules (e.g. ConfessionService) can inject the metrics
 * service optionally without importing this module.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [OperationalMetricsService, HttpMetricsMiddleware],
  exports: [OperationalMetricsService],
})
export class ObservabilityModule {}
