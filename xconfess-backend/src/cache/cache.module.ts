import { Global, Module } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';
import { CacheDiagnosticsService } from './cache-diagnostics.service';
import { RedisCacheStore } from './redis-cache.store';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RedisCacheStore,
    // Best-effort cache-manager reads can turn adapter errors into misses.
    // Security consumers must receive failures instead of a fresh memory cache.
    { provide: CACHE_MANAGER, useExisting: RedisCacheStore },
    CacheService,
    CacheDiagnosticsService,
  ],
  exports: [CACHE_MANAGER, CacheService, CacheDiagnosticsService],
})
export class CacheModule {}
