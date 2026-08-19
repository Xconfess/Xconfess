import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

function resolveDisabledReason(rawValue: unknown): string {
  if (rawValue === 'false') {
    return 'ENABLE_BACKGROUND_JOBS is set to "false" (background jobs intentionally disabled)';
  }
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 'ENABLE_BACKGROUND_JOBS is not set (defaults to disabled)';
  }
  return `ENABLE_BACKGROUND_JOBS is set to "${String(rawValue)}" (expected "true" to enable)`;
}

function resolveActionableHint(errorMessage: string): string {
  const lower = errorMessage.toLowerCase();

  if (lower.includes('econnrefused')) {
    return 'Redis server is not running or not accepting connections. Verify REDIS_HOST and REDIS_PORT, and ensure Redis is started.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'Connection timed out. Check network connectivity between the application and Redis host.';
  }
  if (lower.includes('noauth') || lower.includes('auth')) {
    return 'Authentication failed. If Redis requires a password, set the REDIS_PASSWORD environment variable.';
  }

  return 'Check backend logs for the full error. Verify REDIS_HOST and REDIS_PORT environment variables.';
}

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const rawConfig = this.configService.get<string | undefined>(
      'ENABLE_BACKGROUND_JOBS',
    );
    const jobsEnabled = rawConfig === 'true';

    if (!jobsEnabled) {
      return this.getStatus(key, true, {
        mode: 'disabled',
        reason: resolveDisabledReason(rawConfig),
        severity: 'info',
      });
    }

    const host =
      this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') || 6379;

    const client = new Redis({
      host,
      port,
      connectTimeout: 2000,
      lazyConnect: true,
      retryStrategy: () => null,
    });

    try {
      await client.connect();

      const start = Date.now();
      await client.ping();
      const latencyMs = Date.now() - start;

      // Retrieve server version and connected client count
      const infoRaw = await client.info('server');
      const versionMatch = infoRaw.match(/redis_version:([\d.]+)/);
      const version = versionMatch ? versionMatch[1] : undefined;

      const clientsRaw = await client.info('clients');
      const clientsMatch = clientsRaw.match(/connected_clients:(\d+)/);
      const connectedClients = clientsMatch
        ? parseInt(clientsMatch[1], 10)
        : undefined;

      return this.getStatus(key, true, {
        host,
        port,
        latencyMs,
        version,
        connectedClients,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Redis health check failed: ${message}`);
      throw new HealthCheckError(
        'Redis is unreachable',
        this.getStatus(key, false, {
          host,
          port,
          error: message,
          hint: resolveActionableHint(message),
        }),
      );
    } finally {
      try {
        await client.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
  }
}
