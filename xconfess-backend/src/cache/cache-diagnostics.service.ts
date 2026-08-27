/**
 * Cache Diagnostics Service
 *
 * Provides optional observability for cache operations:
 * - Hit/Miss tracking with counts and percentages
 * - Invalidation reason logging
 * - Key pattern analysis
 *
 * Can be enabled via CACHE_DIAGNOSTICS_ENABLED environment variable
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CacheOperationMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  invalidations: number;
}

export interface CacheHitRate {
  total: number;
  hits: number;
  misses: number;
  hitRate: number; // percentage
  timestamp: Date;
}

export interface InvalidationEvent {
  prefix: string;
  keysEvicted: number;
  reason: string;
  timestamp: Date;
  elapsedMs: number;
}

@Injectable()
export class CacheDiagnosticsService {
  private readonly logger = new Logger(CacheDiagnosticsService.name);
  private readonly enabled: boolean;
  private metrics: Map<string, CacheOperationMetrics> = new Map();
  private invalidationEvents: InvalidationEvent[] = [];
  private readonly maxInvalidationEvents = 100;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>(
      'CACHE_DIAGNOSTICS_ENABLED',
      false,
    );

    if (this.enabled) {
      this.logger.log('Cache diagnostics enabled');
    }
  }

  /**
   * Check if diagnostics are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Record a cache hit for a given namespace
   */
  recordHit(namespace: string): void {
    if (!this.enabled) return;

    const metrics = this.getOrCreateMetrics(namespace);
    metrics.hits++;
    this.metrics.set(namespace, metrics);
  }

  /**
   * Record a cache miss for a given namespace
   */
  recordMiss(namespace: string): void {
    if (!this.enabled) return;

    const metrics = this.getOrCreateMetrics(namespace);
    metrics.misses++;
    this.metrics.set(namespace, metrics);
  }

  /**
   * Record a cache set operation
   */
  recordSet(namespace: string): void {
    if (!this.enabled) return;

    const metrics = this.getOrCreateMetrics(namespace);
    metrics.sets++;
    this.metrics.set(namespace, metrics);
  }

  /**
   * Record a cache delete operation
   */
  recordDelete(namespace: string): void {
    if (!this.enabled) return;

    const metrics = this.getOrCreateMetrics(namespace);
    metrics.deletes++;
    this.metrics.set(namespace, metrics);
  }

  /**
   * Record a cache invalidation event
   */
  recordInvalidation(
    prefix: string,
    keysEvicted: number,
    reason: string,
    elapsedMs: number,
  ): void {
    if (!this.enabled) return;

    const event: InvalidationEvent = {
      prefix,
      keysEvicted,
      reason,
      timestamp: new Date(),
      elapsedMs,
    };

    this.invalidationEvents.push(event);

    // Keep only the last N events
    if (this.invalidationEvents.length > this.maxInvalidationEvents) {
      this.invalidationEvents.shift();
    }

    // Log the invalidation
    this.logger.debug(
      `[DIAGNOSTICS] Cache invalidation: prefix="${prefix}", evicted=${keysEvicted}, reason="${reason}", elapsed=${elapsedMs}ms`,
    );

    // Update metrics
    const namespace = this.extractNamespace(prefix);
    if (namespace) {
      const metrics = this.getOrCreateMetrics(namespace);
      metrics.invalidations++;
      this.metrics.set(namespace, metrics);
    }
  }

  /**
   * Get hit rate for a specific namespace
   */
  getHitRate(namespace: string): CacheHitRate | null {
    const metrics = this.metrics.get(namespace);
    if (!metrics) return null;

    const total = metrics.hits + metrics.misses;
    const hitRate = total > 0 ? (metrics.hits / total) * 100 : 0;

    return {
      total,
      hits: metrics.hits,
      misses: metrics.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      timestamp: new Date(),
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, CacheOperationMetrics> {
    const result: Record<string, CacheOperationMetrics> = {};
    this.metrics.forEach((value, key) => {
      result[key] = { ...value };
    });
    return result;
  }

  /**
   * Get recent invalidation events
   */
  getRecentInvalidations(count: number = 10): InvalidationEvent[] {
    return this.invalidationEvents.slice(-count);
  }

  /**
   * Get all invalidation events
   */
  getAllInvalidations(): InvalidationEvent[] {
    return [...this.invalidationEvents];
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
    this.invalidationEvents = [];
    this.logger.log('Cache diagnostics metrics reset');
  }

  /**
   * Generate a diagnostic report
   */
  generateReport(): string {
    const lines: string[] = [
      '=== Cache Diagnostics Report ===',
      `Generated at: ${new Date().toISOString()}`,
      '',
    ];

    if (!this.enabled) {
      lines.push('Diagnostics are DISABLED');
      return lines.join('\n');
    }

    lines.push('--- Metrics by Namespace ---');

    this.metrics.forEach((metrics, namespace) => {
      const total = metrics.hits + metrics.misses;
      const hitRate =
        total > 0 ? ((metrics.hits / total) * 100).toFixed(2) : '0.00';

      lines.push(
        `${namespace}:`,
        `  Hits: ${metrics.hits}, Misses: ${metrics.misses}, Hit Rate: ${hitRate}%`,
        `  Sets: ${metrics.sets}, Deletes: ${metrics.deletes}, Invalidations: ${metrics.invalidations}`,
      );
    });

    if (this.invalidationEvents.length > 0) {
      lines.push('', '--- Recent Invalidations ---');
      const recent = this.invalidationEvents.slice(-5);
      recent.forEach((event) => {
        lines.push(
          `  [${event.timestamp.toISOString()}] ${event.prefix}: evicted=${event.keysEvicted}, reason="${event.reason}"`,
        );
      });
    }

    return lines.join('\n');
  }

  private getOrCreateMetrics(namespace: string): CacheOperationMetrics {
    const existing = this.metrics.get(namespace);
    if (existing) {
      return { ...existing };
    }
    return {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      invalidations: 0,
    };
  }

  private extractNamespace(prefix: string): string | null {
    // Extract the first part of the key as namespace
    const parts = prefix.split(':');
    return parts.length > 0 ? parts[0] : null;
  }
}
