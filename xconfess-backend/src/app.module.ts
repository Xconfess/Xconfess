import { Module } from '@nestjs/common';
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
import { SearchDiscoveryModule } from './search-discovery/search-discovery.module';
import { ReactionModule } from './reaction/reaction.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { APP_GUARD } from '@nestjs/core';
import throttleConfig from './config/throttle.config';
import { RedisHealthIndicator } from './health/redis.health';
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
// ✅ Canonical queue stack: @nestjs/bullmq (BullMQ v4 + ioredis)
// The legacy @nestjs/bull import has been removed. All queues use BullMQ.
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [throttleConfig, appConfig],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl') || 900,
            limit: config.get<number>('throttle.limit') || 100,
          },
        ],
      }),
    }),
    /**
     * BullMQ global connection config.
     *
     * A single ioredis connection object is shared across all queues via
     * BullModule.forRootAsync().  Individual queue modules call
     * BullModule.registerQueue({ name: '...' }) — they do NOT pass their own
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

        if (config.get<string>('ENABLE_BACKGROUND_JOBS') === 'true') {
          if (!redisHost || !redisPort) {
            throw new Error(
              'Misconfiguration: ENABLE_BACKGROUND_JOBS is true but ' +
                'REDIS_HOST or REDIS_PORT is missing from the environment.',
            );
          }
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
              delay: 5_000, // 5 s → 10 s → 20 s
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
    TerminusModule,
    UserModule,
    AuthModule,
    ConfessionModule,
    SearchDiscoveryModule,
    ReactionModule,
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RedisHealthIndicator,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
