import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './health/redis.health';
import { SchemaReadinessHealthIndicator } from './health/schema-readiness.health';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AdminGuard } from './auth/admin.guard';
import { JobManagementService } from './notifications/services/job-management.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redis: RedisHealthIndicator,
    private readonly schemaReadiness: SchemaReadinessHealthIndicator,
    private readonly jobManagementService: JobManagementService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get the welcome message for the API' })
  @ApiResponse({
    status: 200,
    description: 'Returns a greeting message',
    schema: { example: 'Hello, world!' },
  })
  getHello(): string {
    return this.appService.getHello();
  }

  // ✅ HEALTH ENDPOINT
  @Get('health')
  @HealthCheck()
  @ApiOperation({
    summary: 'Application health check',
    description:
      'Liveness-style bundle: process, database ping, Redis, and confession-table schema readiness (required columns and FTS indexes on `anonymous_confessions`). Schema drift or failed verification makes the overall check fail (HTTP 503) with details under the `schema` key.',
  })
  @ApiResponse({
    status: 200,
    description: 'All checks passed',
  })
  @ApiResponse({
    status: 503,
    description:
      'One or more checks failed (e.g. schema drift, DB unreachable, Redis down)',
  })
  check() {
    return this.health.check([
      () => ({ app: { status: 'up' } }),
      async () => this.db.pingCheck('database'),
      async () => this.redis.isHealthy('redis'),
      async () => this.schemaReadiness.isHealthy('schema'),
    ]);
  }

  @Get('diagnostics/notifications')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({
    summary: 'Notification delivery metrics and queue health diagnostics',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns queue depth, DLQ depth, counters, and timer metrics for notification processing',
  })
  async getNotificationDiagnostics() {
    return this.jobManagementService.getDiagnostics();
  }
}
