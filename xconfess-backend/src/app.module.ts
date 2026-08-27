import { Logger, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SanitizationMiddleware } from './middleware/sanitization.middleware';
import { RequestIdMiddleware } from './middleware/request-id.middleware'; // ADAPT: fix path if it lives elsewhere
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getTypeOrmConfig } from './config/database.config';
import { envValidationSchema } from './config/env.validation';
import appConfig from './config/app.config';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ConfessionModule } from './confession/confession.module';
import { ConfessionDraftModule } from './confession-draft/confession-draft.module';
import { SearchDiscoveryModule } from './search-discovery/search-discovery.module';
import { CommentModule } from './comment/comment.module';
import { ReactionModule } from './reaction/reaction.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import throttleConfig from './config/throttle.config';
import exportConfig from './config/export.config';
import { HealthModule } from './health/health.module';
import { MessagesModule } from './messages/messages.module';
import { AdminModule } from './admin/admin.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ReportModule } from './report/report.module';
import { DataExportModule } from './data-export/data-export.module';
import { StellarModule } from './stellar/stellar.module';
import { CacheModule } from './cache/cache.module';
import { TippingModule } from './tipping/tipping.module';
import { LoggerModule } from './logger/logger.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EncryptionModule } from './encryption/encryption.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DatabaseModule } from './database/database.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { BookmarkModule } from './bookmark/bookmark.module';
import { KeyRotationModule } from './key-rotation/key-rotation.module';
// âœ… Canonical queue stack: @nestjs/bullmq (BullMQ v4 + ioredis)
// The legacy @nestjs/bull import has been removed. All queues use BullMQ.
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [throttleConfig, appConfig, exportConfig],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl') || 60_000,
            limit: config.get<number>('throttle.limit') || 60,
          },
          {
            name: 'strict',
            ttl: (config.get<number>('throttle.strictTtlSeconds') || 60) * 1000,
            limit: config.get<number>('throttle.strictLimit') || 5,
          },
        ],
      }),
    }),
    /**
     * BullMQ global connection config.
     *
     * A single ioredis connection object is shared across all queues via
     * BullModule.forRootAsync().  Individual queue modules call
     * BullModule.registerQueue({ name: '...' }) â€” they do NOT pass their own
     * connection.
     *
     * Retry semantics (defaultJobOptions) are set here so every queue inherits
     * them consistently.  Override per-queue only when there is a documented
     * reason.
     */
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisHost = config.get<string>('REDIS_HOST');
        const redisPort = config.get<number>('REDIS_PORT');
        const jobsEnabled =
          config.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';

        if (jobsEnabled) {
          if (!redisHost || !redisPort) {
            throw new Error(
              'Misconfiguration: ENABLE_BACKGROUND_JOBS is true but ' +
                'REDIS_HOST or REDIS_PORT is missing from the environment.',
            );
          }
        } else {
          new Logger('Bootstrap').warn(
            'ENABLE_BACKGROUND_JOBS is not "true" â€” BullMQ workers are disabled. ' +
              'Queue producers will silently skip enqueue calls. Redis connectivity is not required.',
          );
        }

        return {
          connection: {
            host: redisHost || 'localhost',
            port: redisPort || 6379,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5_000, // 5 s â†’ 10 s â†’ 20 s
            },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
          },
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    HealthModule,
    UserModule,
    AuthModule,
    ConfessionModule,
    ConfessionDraftModule,
    SearchDiscoveryModule,
    ReactionModule,
    CommentModule,
    MessagesModule,
    AdminModule,
    ReportModule,
    DataExportModule,
    NotificationsModule,
    StellarModule,
    TippingModule,
    LoggerModule,
    EncryptionModule,
    CacheModule,
    DatabaseModule,
    FeatureFlagsModule,
    BookmarkModule,
    KeyRotationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // RequestIdMiddleware first so downstream handlers/loggers can read
    // req.requestId, and so it's set even if SanitizationMiddleware throws.
    consumer.apply(RequestIdMiddleware, SanitizationMiddleware).forRoutes('*');
  }
}
