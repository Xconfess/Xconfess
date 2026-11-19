import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  buildDependencyDetail,
  classifyDependencyError,
  DependencyErrorCode,
  resolveBackgroundJobsDisabledReason,
  resolveDependencyTimeoutMs,
  summarizeDependencyError,
  withDependencyTimeout,
} from './dependency-check';

function resolveActionableHint(code: DependencyErrorCode): string {
  switch (code) {
    case 'CONNECTION_REFUSED':
      return 'Redis server is not running or not accepting connections. Verify REDIS_HOST and REDIS_PORT, and ensure Redis is started.';
    case 'TIMEOUT':
      return 'Connection timed out. Check network connectivity between the application and Redis host, or raise HEALTH_REDIS_TIMEOUT_MS.';
    case 'AUTH_FAILED':
      return 'Authentication failed. If Redis requires a password, set the REDIS_PASSWORD environment variable.';
    case 'DNS_LOOKUP_FAILED':
      return 'Redis host could not be resolved. Verify REDIS_HOST.';
    default:
      return 'Check backend logs for the full error. Verify REDIS_HOST and REDIS_PORT environment variables.';
  }
}

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const timeoutMs = resolveDependencyTimeoutMs(this.configService, 'redis');
    const rawConfig = this.configService.get<string | undefined>(
      'ENABLE_BACKGROUND_JOBS',
    );

    if (rawConfig !== 'true') {
      return {
        [key]: buildDependencyDetail({
          dependency: 'redis',
          state: 'disabled',
          timeoutMs,
          message: 'Redis check skipped because background jobs are disabled',
          details: {
            reason: resolveBackgroundJobsDisabledReason(rawConfig),
            severity: 'info',
          },
        }),
      };
    }

    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = Number(this.configService.get<number>('REDIS_PORT')) || 6379;

    const client = new Redis({
      host,
      port,
      connectTimeout: timeoutMs,
      lazyConnect: true,
      retryStrategy: () => null,
      maxRetriesPerRequest: 0,
    });

    const start = Date.now();
    try {
      const details = await withDependencyTimeout(
        'redis',
        timeoutMs,
        async () => {
          await client.connect();
          await client.ping();

          const infoRaw = await client.info('server');
          const versionMatch = infoRaw.match(/redis_version:([\d.]+)/);
          const clientsRaw = await client.info('clients');
          const clientsMatch = clientsRaw.match(/connected_clients:(\d+)/);

          return {
            version: versionMatch ? versionMatch[1] : undefined,
            connectedClients: clientsMatch
              ? parseInt(clientsMatch[1], 10)
              : undefined,
          };
        },
      );

      return {
        [key]: buildDependencyDetail({
          dependency: 'redis',
          state: 'up',
          timeoutMs,
          latencyMs: Date.now() - start,
          message: 'Redis is reachable',
          details,
        }),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Redis health check failed: ${message}`);
      const errorCode = classifyDependencyError(error);
      throw new HealthCheckError('Redis is unreachable', {
        [key]: buildDependencyDetail({
          dependency: 'redis',
          state: 'down',
          timeoutMs,
          message: `Redis ${summarizeDependencyError(errorCode)}`,
          errorCode,
          hint: resolveActionableHint(errorCode),
        }),
      });
    } finally {
      try {
        client.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
  }
}
