// src/confession/confession.module.ts
import {
  Module,
  NestModule,
  MiddlewareConsumer,
  forwardRef,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfessionController } from './confession.controller';
import { ConfessionService } from './confession.service';
import { AnonymousConfession } from './entities/confession.entity';
import { Tag } from './entities/tag.entity';
import { ConfessionTag } from './entities/confession-tag.entity';
import { ConfessionIdempotencyRecord } from './entities/confession-idempotency-record.entity';
import { AnonymousConfessionRepository } from './repository/confession.repository';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { TagService } from './tag.service';
import { ConfessionSchedulerService } from './confession-scheduler.service';
import { ConfessionIdempotencyService } from './confession-idempotency.service';
import { ReactionModule } from '../reaction/reaction.module';
import { AnonymousContextMiddleware } from '../middleware/anonymous-context.middleware';
import { ModerationModule } from '../moderation/moderation.module';
import { UserModule } from '../user/user.module';
import { StellarModule } from '../stellar/stellar.module';
import { SearchDiscoveryModule } from '../search-discovery/search-discovery.module';
import { AnomalyDetectionModule } from '../anomaly/anomaly-detection.module';
// In-memory mock Redis for development without Redis server
const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';
class MockRedis {
  private store = new Map<string, { value: string; expiry?: number }>();

  async exists(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return 0;
    }
    return 1;
  }

  async set(
    key: string,
    value: string,
    _exFlag?: string,
    exSeconds?: number,
  ): Promise<string> {
    const expiry = exSeconds ? Date.now() + exSeconds * 1000 : undefined;
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([AnonymousConfession, Tag, ConfessionTag, ConfessionIdempotencyRecord]),

    forwardRef(() => ReactionModule),
    ModerationModule,
    forwardRef(() => UserModule),
    StellarModule,
    SearchDiscoveryModule,
    AnomalyDetectionModule,
  ],
  controllers: [ConfessionController],
  providers: [
    ConfessionService,
    AnonymousConfessionRepository,
    ConfessionViewCacheService,
    TagService,
    ConfessionSchedulerService,
    ConfessionIdempotencyService,
    { provide: 'VIEW_CACHE_EXPIRY', useValue: 60 * 60 },
    // Mock Redis provider for development without Redis server
    { provide: REDIS_TOKEN, useValue: new MockRedis() },
  ],
  exports: [
    AnonymousConfessionRepository,
    ConfessionService,
    ConfessionSchedulerService,
    ConfessionIdempotencyService,
  ],
})
export class ConfessionModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AnonymousContextMiddleware).forRoutes('confessions');
  }
}
