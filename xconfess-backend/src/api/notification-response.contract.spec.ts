import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { NotificationController } from '../notifications/notifications.controller';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationService } from '../notifications/services/notification.service';

const allowedNotificationKeys = [
  'id',
  'type',
  'title',
  'message',
  'isRead',
  'readAt',
  'createdAt',
  'updatedAt',
  'metadata',
].sort();

const privateNotificationKeys = [
  'userId',
  'user',
  'sourceKey',
  'isEmailSent',
  'emailSentAt',
];

const privateMetadataKeys = [
  'senderId',
  'senderAnonymousId',
  'sourceEventId',
];

function buildNotification(): Notification {
  return {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    type: NotificationType.NEW_MESSAGE,
    userId: 'user-1',
    user: { id: 'user-1', email: 'private@example.com' } as any,
    title: 'New message',
    message: 'Someone sent you a message',
    metadata: {
      messageId: 'message-1',
      confessionId: 'confession-1',
      senderId: 'sender-private',
      senderAnonymousId: 'anon-private',
      sourceEventId: 'event-private',
    },
    sourceKey: 'source-key-private',
    isRead: false,
    readAt: null,
    isEmailSent: true,
    emailSentAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Notification;
}

function assertPublicNotification(body: any) {
  expect(Object.keys(body).sort()).toEqual(allowedNotificationKeys);
  for (const key of privateNotificationKeys) {
    expect(body).not.toHaveProperty(key);
  }
  for (const key of privateMetadataKeys) {
    expect(body.metadata).not.toHaveProperty(key);
  }
  expect(body.metadata).toEqual({
    messageId: 'message-1',
    confessionId: 'confession-1',
  });
}

describe('Notification response schema contract', () => {
  let app: INestApplication;
  let notificationRepository: {
    findAndCount: jest.Mock;
    count: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };

  beforeAll(async () => {
    notificationRepository = {
      findAndCount: jest.fn(async () => [[buildNotification()], 1]),
      count: jest.fn(async () => 1),
      findOne: jest.fn(async () => buildNotification()),
      save: jest.fn(async (notification: Notification) => notification),
    };

    const notificationService = new NotificationService(
      notificationRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [{ provide: NotificationService, useValue: notificationService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = { id: 'user-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes only documented fields from the notification list endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications')
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual([
      'notifications',
      'total',
      'unreadCount',
    ]);
    expect(response.body.notifications).toHaveLength(1);
    assertPublicNotification(response.body.notifications[0]);
  });

  it('exposes only documented fields from the notification detail endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications/f47ac10b-58cc-4372-a567-0e02b2c3d479')
      .expect(200);

    assertPublicNotification(response.body);
  });

  it('exposes only documented fields when marking a notification as read', async () => {
    const response = await request(app.getHttpServer())
      .patch('/notifications/f47ac10b-58cc-4372-a567-0e02b2c3d479/read')
      .expect(200);

    assertPublicNotification(response.body);
    expect(response.body.isRead).toBe(true);
  });

  it('keeps unread-count on its dedicated route', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .expect(200);

    expect(response.body).toEqual({ unreadCount: 1 });
  });
});
