import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GracefulShutdownService } from '../common/graceful-shutdown.service';

const MONITORED_QUEUES = [
  'notifications',
  'notifications-dlq',
  'export-queue',
  'confession-draft-publisher',
] as const;

@Injectable()
export class HealthQueueRegistrar implements OnModuleInit {
  constructor(
    private readonly gracefulShutdown: GracefulShutdownService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('notifications-dlq') private readonly notificationsDlqQueue: Queue,
    @InjectQueue('export-queue') private readonly exportQueue: Queue,
    @InjectQueue('confession-draft-publisher') private readonly draftQueue: Queue,
  ) {}

  onModuleInit() {
    this.gracefulShutdown.registerQueue('notifications', this.notificationsQueue);
    this.gracefulShutdown.registerQueue('notifications-dlq', this.notificationsDlqQueue);
    this.gracefulShutdown.registerQueue('export-queue', this.exportQueue);
    this.gracefulShutdown.registerQueue('confession-draft-publisher', this.draftQueue);
  }
}