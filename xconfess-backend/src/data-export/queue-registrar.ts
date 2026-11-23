import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GracefulShutdownService } from 'src/common/graceful-shutdown.service';
import { EXPORT_QUEUE_NAME } from './data-export.constants';

@Injectable()
export class DataExportQueueRegistrar implements OnModuleInit {
  constructor(
    private readonly gracefulShutdown: GracefulShutdownService,
    @InjectQueue(EXPORT_QUEUE_NAME) private readonly exportQueue: Queue,
  ) {}

  onModuleInit() {
    this.gracefulShutdown.registerQueue('export-queue', this.exportQueue);
  }
}