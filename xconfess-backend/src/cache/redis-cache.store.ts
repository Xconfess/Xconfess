import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_OPERATION_TIMEOUT_MS = 1000;
const PREFIX = 'xconfess:cache:';

/** The shared cache API uses millisecond TTLs, matching cache-manager v7. */
@Injectable()
export class RedisCacheStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheStore.name);
  readonly client: Redis;
  readonly store: {
    client: Redis;
    keys: (pattern: string) => Promise<string[]>;
  };

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get('REDIS_PORT', 6379)),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      keyPrefix: PREFIX,
      lazyConnect: true,
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: 0,
      connectTimeout: REDIS_OPERATION_TIMEOUT_MS,
      commandTimeout: REDIS_OPERATION_TIMEOUT_MS,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1000),
    });
    this.client.on('error', () => this.logger.warn('Redis cache unavailable'));
    this.store = { client: this.client, keys: (pattern) => this.keys(pattern) };
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch {
      // Optional reads can still use PostgreSQL; security operations fail closed.
      this.logger.warn('Redis cache connection unavailable');
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new ServiceUnavailableException('Shared cache unavailable');
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.run(async () => {
      const value = await this.client.get(key);
      return value === null ? undefined : (JSON.parse(value) as T);
    });
  }

  async set<T>(key: string, value: T, ttl = 300000): Promise<T> {
    return this.run(async () => {
      const serialized = JSON.stringify(value);
      if (ttl > 0) await this.client.set(key, serialized, 'PX', ttl);
      else await this.client.set(key, serialized);
      return value;
    });
  }

  async del(key: string): Promise<boolean> {
    return this.run(async () => (await this.client.del(key)) > 0);
  }

  private async keys(pattern: string): Promise<string[]> {
    return this.run(async () => {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const result = await this.client.scan(
          cursor,
          'MATCH',
          PREFIX + pattern,
          'COUNT',
          100,
        );
        cursor = result[0];
        keys.push(...result[1].map((key) => key.slice(PREFIX.length)));
      } while (cursor !== '0');
      return keys;
    });
  }

  async clear(): Promise<void> {
    for (const key of await this.keys('*')) await this.del(key);
  }
}
