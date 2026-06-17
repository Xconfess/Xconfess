import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface RedisHealthDetail {
  status: 'up' | 'down';
  host?: string;
  port?: number;
  mode?: 'disabled';
  reason?: string;
  severity?: 'info';
  error?: string;
  hint?: string;
}

function renderConfigValue(rawValue: unknown): string {
  if (typeof rawValue === 'string') {
    return rawValue;
  }

  if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    return String(rawValue);
  }

  return 'non-string value';
}

function resolveDisabledReason(rawValue: unknown): string {
  if (rawValue === 'false') {
    return 'ENABLE_BACKGROUND_JOBS is set to "false" (Redis readiness intentionally disabled)';
  }

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 'ENABLE_BACKGROUND_JOBS is not set (Redis readiness defaults to disabled)';
  }

  return `ENABLE_BACKGROUND_JOBS is set to "${renderConfigValue(rawValue)}" (expected "true" to enable Redis readiness)`;
}

function parseRedisPort(rawValue: unknown): number {
  if (typeof rawValue === 'number') {
    return rawValue;
  }

  if (typeof rawValue === 'string' && rawValue.trim() !== '') {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 6379;
  }

  return 6379;
}

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const rawJobsConfig = this.configService.get<string | undefined>(
      'ENABLE_BACKGROUND_JOBS',
    );

    if (rawJobsConfig !== 'true') {
      const detail: RedisHealthDetail = {
        status: 'up',
        mode: 'disabled',
        reason: resolveDisabledReason(rawJobsConfig),
        severity: 'info',
      };

      return this.getStatus(key, true, detail);
    }

    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = parseRedisPort(
      this.configService.get<string | number>('REDIS_PORT', 6379),
    );
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');
    const client = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connectTimeout: 2_000,
      lazyConnect: true,
      retryStrategy: () => null,
    });

    try {
      await client.connect();
      const response = await client.ping();

      if (response !== 'PONG') {
        throw new Error('Unexpected Redis PING response');
      }

      return this.getStatus(key, true, {
        host: redisHost,
        port: redisPort,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Redis readiness check failed: ${message}`);

      throw new HealthCheckError(
        'Redis readiness check failed',
        this.getStatus(key, false, {
          host: redisHost,
          port: redisPort,
          error: message,
          hint: 'Verify REDIS_HOST, REDIS_PORT, and that Redis is reachable when ENABLE_BACKGROUND_JOBS=true.',
        }),
      );
    } finally {
      client.disconnect();
    }
  }
}
