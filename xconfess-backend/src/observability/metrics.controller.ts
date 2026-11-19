import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { readDbPoolStats } from '../database/db-pool-stats';
import { OperationalMetricsService } from './operational-metrics.service';

@ApiTags('Metrics')
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: OperationalMetricsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({
    summary: 'Privacy-safe operational metrics (Prometheus text format)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Request latency/status by safe route category and feed query latency. Labels never contain user or confession identifiers.',
  })
  getMetrics(): string {
    this.metrics.setDbPoolSnapshot(readDbPoolStats(this.dataSource));
    return this.metrics.renderPrometheus();
  }
}
