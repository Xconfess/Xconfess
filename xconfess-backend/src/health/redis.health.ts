import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis health indicator for /health endpoint.
 * Performs a real ping to verify connectivity.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');

    const client = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connectTimeout: 2000, // 2s timeout for health check
      lazyConnect: true,
      retryStrategy: () => null, // Don't retry for health check
    });

    try {
      await client.connect();
      const result = await client.ping();
      const isHealthy = result === 'PONG';

      return this.getStatus(key, isHealthy, {
        host: redisHost,
        port: redisPort,
      });
    } catch (error) {
      this.logger.error(`Redis health check failed: ${error.message}`);
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { message: error.message }),
      );
    } finally {
      client.disconnect();
    }
  }
}
