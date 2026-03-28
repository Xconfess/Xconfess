import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationService } from './services/notification.service';
import { EmailNotificationService } from './services/email-notification.service';
import { NotificationController } from './notifications.controller';
import {
  NotificationProcessor,
  NOTIFICATION_QUEUE,
  NOTIFICATION_DLQ,
} from './processors/notification.processor';
import { NotificationGateway } from './gateways/notification.gateway';
import { DlqAdminController } from './dlq-admin.controller';
import { WebSocketLogger } from '../websocket/websocket.logger';
import { OutboxDispatcherService } from './services/outbox-dispatcher.service';
import { RecipientResolver } from './services/recipient-resolver.service';
import { JobManagementService } from './services/job-management.service';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { User } from '../user/entities/user.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { LoggerModule } from '../logger/logger.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationPreference,
      OutboxEvent,
      User,
    ]),
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: { count: 500 },
        removeOnFail: false,
      },
    }),
    BullModule.registerQueue({
      name: NOTIFICATION_DLQ,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    }),
    ConfigModule,
    AuditLogModule,
    LoggerModule,
    EmailModule,
  ],
  controllers: [NotificationController, DlqAdminController],
  providers: [
    NotificationService,
    EmailNotificationService,
    NotificationProcessor,
    NotificationGateway,
    WebSocketLogger,
    OutboxDispatcherService,
    RecipientResolver,
    JobManagementService,
  ],
  exports: [NotificationService, RecipientResolver],
})
export class NotificationsModule {}
