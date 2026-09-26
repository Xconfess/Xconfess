import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GracefulShutdownService } from 'src/common/graceful-shutdown.service';
import { NOTIFICATION_QUEUE, NOTIFICATION_DLQ } from './processors/notification.processor';

@Injectable()
export class NotificationsQueueRegistrar implements OnModuleInit {
  constructor(
    private readonly gracefulShutdown: GracefulShutdownService,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notificationQueue: Queue,
    @InjectQueue(NOTIFICATION_DLQ) private readonly dlqQueue: Queue,
  ) {}

  onModuleInit() {
    this.gracefulShutdown.registerQueue('notifications', this.notificationQueue);
    this.gracefulShutdown.registerQueue('notifications-dlq', this.dlqQueue);
  }
}