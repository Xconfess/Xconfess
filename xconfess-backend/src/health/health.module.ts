import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { SchemaReadinessHealthIndicator } from './schema-readiness.health';
import { QueueHealthIndicator } from './queue.health';
import { PostgresHealthIndicator } from './postgres.health';

// Inlined to keep the health module self-contained and avoid importing from
// feature-module internals.
const MONITORED_QUEUES = [
  'notifications',
  'notifications-dlq',
  'export-queue',
  'confession-draft-publisher',
];

@Module({
  imports: [
    TerminusModule,
    ...MONITORED_QUEUES.map((name) => BullModule.registerQueue({ name })),
  ],
  controllers: [HealthController],
  providers: [
    PostgresHealthIndicator,
    RedisHealthIndicator,
    SchemaReadinessHealthIndicator,
    QueueHealthIndicator,
  ],
})
export class HealthModule {}
