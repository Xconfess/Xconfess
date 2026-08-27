import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface DependencyStatus {
  status: 'up' | 'degraded' | 'down' | 'disabled';
  details?: Record<string, any>;
  error?: string;
}

export interface WebSocketHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  websocket: {
    enabled: boolean;
    namespace: string;
  };
  dependencies?: {
    redis?: DependencyStatus;
    notifications?: DependencyStatus;
  };
}

@Injectable()
export class WebSocketHealthService {
  private readonly logger = new Logger(WebSocketHealthService.name);

  constructor(private readonly configService: ConfigService) {}

  async checkHealth(): Promise<WebSocketHealthResult> {
    const baseResult: WebSocketHealthResult = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      websocket: {
        enabled: true,
        namespace: '/reactions',
      },
      dependencies: {},
    };

    const [redisStatus, notificationsStatus] = await Promise.all([
      this.checkRedisHealth(),
      this.checkNotificationsHealth(),
    ]);

    baseResult.dependencies!.redis = redisStatus;
    baseResult.dependencies!.notifications = notificationsStatus;

    if (redisStatus.status === 'down' || notificationsStatus.status === 'down') {
      baseResult.status = 'unhealthy';
    } else if (redisStatus.status === 'degraded' || notificationsStatus.status === 'degraded') {
      baseResult.status = 'degraded';
    }

    return baseResult;
  }

  private async checkRedisHealth(): Promise<DependencyStatus> {
    const jobsEnabled =
      this.configService.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';
    if (!jobsEnabled) {
      return {
        status: 'disabled',
        details: {
          mode: 'disabled',
          reason:
            'Redis-backed notification queues are not required while ENABLE_BACKGROUND_JOBS is not "true"',
        },
      };
    }

    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');

    const client = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connectTimeout: 2000,
      lazyConnect: true,
      retryStrategy: () => null,
    });

    try {
      await client.connect();
      const result = await client.ping();
      const isUp = result === 'PONG';

      return {
        status: isUp ? 'up' : 'down',
        details: { host: redisHost, port: redisPort },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`WebSocket Redis health check failed: ${message}`);
      return {
        status: 'down',
        error: message,
      };
    } finally {
      client.disconnect();
    }
  }

  private async checkNotificationsHealth(): Promise<DependencyStatus> {
    const jobsEnabled =
      this.configService.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';

    if (!jobsEnabled) {
      return {
        status: 'up',
        details: { mode: 'disabled' },
      };
    }

    return {
      status: 'up',
      details: { mode: 'enabled' },
    };
  }
}
