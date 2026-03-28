import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheDiagnosticsService } from './cache-diagnostics.service';
import {
  CacheKeyBuilder,
  CacheNamespace,
  AnalyticsEntityType,
} from './cache-namespace';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly diagnosticsEnabled: boolean;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly diagnosticsService?: CacheDiagnosticsService,
  ) {
    this.diagnosticsEnabled = this.diagnosticsService?.isEnabled() ?? false;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.cacheManager.get<T>(key);
      if (cached) {
        this.logger.debug(`Cache HIT for key: ${key}`);
        this.recordHit(key);
      } else {
        this.logger.debug(`Cache MISS for key: ${key}`);
        this.recordMiss(key);
      }
      return cached || null;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
      this.logger.debug(
        `Cache SET for key: ${key} (TTL: ${ttl || 'default'}s)`,
      );
      this.recordSet(key);
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug(`Cache DEL for key: ${key}`);
      this.recordDelete(key);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const manager = this.cacheManager as any;
      const store = manager.store || (manager.stores && manager.stores[0]);
      if (store && store.keys) {
        const keys = await store.keys(`${pattern}*`);
        if (keys && keys.length > 0) {
          await Promise.all(
            keys.map((key: string) => this.cacheManager.del(key)),
          );
          this.logger.debug(
            `Cache DEL pattern: ${pattern}* (${keys.length} keys)`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Cache delete pattern error for ${pattern}:`, error);
    }
  }

  /**
   * Invalidates all keys matching a given prefix and emits a structured log
   * entry so cache churn can be observed (e.g. by a log aggregator).
   *
   * @param prefix - The key prefix to match (e.g. "analytics:trending").
   *                 A trailing wildcard is appended automatically.
   * @param reason - Human-readable reason for the invalidation, used only
   *                 for observability logging.
   * @returns The number of keys that were evicted.
   */
  async invalidateSegment(prefix: string, reason: string): Promise<number> {
    const startMs = Date.now();
    try {
      const manager = this.cacheManager as any;
      const store = manager.store || (manager.stores && manager.stores[0]);
      if (store && typeof store.keys === 'function') {
        const keys: string[] = await store.keys(`${prefix}*`);
        if (keys.length > 0) {
          await Promise.all(keys.map((key) => this.cacheManager.del(key)));
          const elapsedMs = Date.now() - startMs;
          this.logger.log(
            `Cache segment invalidated: prefix="${prefix}*", evicted=${keys.length}, reason="${reason}", elapsed=${elapsedMs}ms`,
          );

          // Record diagnostics if enabled
          if (this.diagnosticsEnabled && this.diagnosticsService) {
            this.diagnosticsService.recordInvalidation(
              prefix,
              keys.length,
              reason,
              elapsedMs,
            );
          }

          return keys.length;
        }
        this.logger.debug(
          `Cache segment invalidate noop: prefix="${prefix}*", reason="${reason}" (no matching keys)`,
        );
        return 0;
      }
      this.logger.warn(
        `Cache store does not support key enumeration; segment invalidation skipped for prefix="${prefix}"`,
      );
      return 0;
    } catch (error) {
      this.logger.error(
        `Cache invalidateSegment error for prefix "${prefix}" (reason="${reason}"):`,
        error,
      );
      return 0;
    }
  }

  async reset(): Promise<void> {
    try {
      const manager = this.cacheManager as any;
      if (typeof manager.reset === 'function') {
        await manager.reset();
      } else if (typeof manager.clear === 'function') {
        await manager.clear();
      }
      this.logger.warn('Cache RESET: All keys deleted');
    } catch (error) {
      this.logger.error('Cache reset error:', error);
    }
  }

  /**
   * Build a key using the namespace convention
   * @deprecated Use CacheKeyBuilder or pre-built keys from cache-namespace.ts
   */
  buildKey(...parts: (string | number)[]): string {
    return parts.join(':');
  }

  /**
   * Build a key using the new CacheKeyBuilder pattern
   * @example buildNamespaceKey(CacheNamespace.ANALYTICS).entity('trending').identifier('7d').build()
   */
  buildNamespaceKey(namespace: string): CacheKeyBuilder {
    return new CacheKeyBuilder(namespace);
  }

  // ─── Diagnostics helpers ─────────────────────────────────────────────────

  private recordHit(key: string): void {
    if (this.diagnosticsEnabled && this.diagnosticsService) {
      const namespace = this.extractNamespace(key);
      this.diagnosticsService.recordHit(namespace);
    }
  }

  private recordMiss(key: string): void {
    if (this.diagnosticsEnabled && this.diagnosticsService) {
      const namespace = this.extractNamespace(key);
      this.diagnosticsService.recordMiss(namespace);
    }
  }

  private recordSet(key: string): void {
    if (this.diagnosticsEnabled && this.diagnosticsService) {
      const namespace = this.extractNamespace(key);
      this.diagnosticsService.recordSet(namespace);
    }
  }

  private recordDelete(key: string): void {
    if (this.diagnosticsEnabled && this.diagnosticsService) {
      const namespace = this.extractNamespace(key);
      this.diagnosticsService.recordDelete(namespace);
    }
  }

  private extractNamespace(key: string): string {
    const parts = key.split(':');
    return parts[0] || 'unknown';
  }
}
