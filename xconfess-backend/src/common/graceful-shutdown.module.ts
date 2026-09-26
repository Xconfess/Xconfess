import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { GracefulShutdownService } from './graceful-shutdown.service';

const MONITORED_QUEUES = [
  'confession-draft-publisher',
  'notifications',
  'notifications-dlq',
  'export-queue',
] as const;

@Global()
@Module({
  imports: [
    ConfigModule,
    EventEmitterModule,
    ...MONITORED_QUEUES.map((name) => BullModule.registerQueue({ name })),
  ],
  providers: [GracefulShutdownService],
  exports: [GracefulShutdownService],
})
export class GracefulShutdownModule {}