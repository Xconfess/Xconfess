import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { NotificationAdminController } from '../src/notification/notification.admin.controller';
import { NotificationQueue } from '../src/notification/notification.queue';
import { User, UserRole } from '../src/user/entities/user.entity';
import { Repository } from 'typeorm';

describe('DLQ Admin Security (e2e)', () => {
  let app: INestApplication;
  let notificationQueue: NotificationQueue;
  let userRepository: Repository<User>;
  let adminJwtToken: string;
  let userJwtToken: string;

  const mockAdmin: User = {
    id: 1,
    username: 'admin',
    emailEncrypted: 'admin@example.com',
    emailIv: 'iv',
    emailTag: 'tag',
    emailHash: 'hash',
    password: 'hashedpassword',
    resetPasswordToken: null,
    resetPasswordExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    is_active: true,
    notificationPreferences: {},
    role: UserRole.ADMIN,
    isNotificationEnabled: jest.fn(),
    getEmail: jest.fn(),
  };

  const mockRegularUser: User = {
    id: 2,
    username: 'user',
    emailEncrypted: 'user@example.com',
    emailIv: 'iv',
    emailTag: 'tag',
    emailHash: 'hash',
    password: 'hashedpassword',
    resetPasswordToken: null,
    resetPasswordExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    is_active: true,
    notificationPreferences: {},
    role: UserRole.USER,
    isNotificationEnabled: jest.fn(),
    getEmail: jest.fn(),
  };

  const mockDlqJobs = {
    jobs: [
      {
        id: 'job1',
        data: { userId: 1, type: 'email' },
        opts: { attempts: 5, delay: 1000 },
        timestamp: Date.now(),
        finishedOn: Date.now(),
        processedOn: Date.now(),
      },
    ],
    total: 1,
    page: 1,
    limit: 10,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [NotificationAdminController],
      providers: [
        NotificationQueue,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    notificationQueue = moduleFixture.get<NotificationQueue>(NotificationQueue);
    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );

    // Mock JWT tokens
    adminJwtToken = 'admin-jwt-token';
    userJwtToken = 'user-jwt-token';

    // Mock notification queue methods
    jest.spyOn(notificationQueue, 'listDlqJobs').mockResolvedValue(mockDlqJobs);
    jest
      .spyOn(notificationQueue, 'replayDlqJob')
      .mockResolvedValue({ success: true });
    jest
      .spyOn(notificationQueue, 'replayDlqJobsBulk')
      .mockResolvedValue({ success: true, count: 1 });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Legacy DLQ endpoints should not exist', () => {
    it('GET /admin/dlq should return 404', () => {
      return request(app.getHttpServer()).get('/admin/dlq').expect(404);
    });

    it('GET /admin/dlq/:id should return 404', () => {
      return request(app.getHttpServer()).get('/admin/dlq/123').expect(404);
    });

    it('POST /admin/dlq/:id/retry should return 404', () => {
      return request(app.getHttpServer())
        .post('/admin/dlq/123/retry')
        .expect(404);
    });

    it('DELETE /admin/dlq/:id should return 404', () => {
      return request(app.getHttpServer()).delete('/admin/dlq/123').expect(404);
    });

    it('DELETE /admin/dlq should return 404', () => {
      return request(app.getHttpServer()).delete('/admin/dlq').expect(404);
    });
  });

  describe('Protected DLQ endpoints should require authentication', () => {
    it('GET /admin/notifications/dlq should return 401 without auth', () => {
      return request(app.getHttpServer())
        .get('/admin/notifications/dlq')
        .expect(401);
    });

    it('POST /admin/notifications/dlq/:jobId/replay should return 401 without auth', () => {
      return request(app.getHttpServer())
        .post('/admin/notifications/dlq/123/replay')
        .expect(401);
    });

    it('POST /admin/notifications/dlq/replay should return 401 without auth', () => {
      return request(app.getHttpServer())
        .post('/admin/notifications/dlq/replay')
        .expect(401);
    });
  });

  describe('Protected DLQ endpoints should require admin authorization', () => {
    beforeEach(() => {
      // Mock user repository to return regular user (non-admin)
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockRegularUser);
    });

    it('GET /admin/notifications/dlq should return 403 for non-admin user', () => {
      return request(app.getHttpServer())
        .get('/admin/notifications/dlq')
        .set('Authorization', `Bearer ${userJwtToken}`)
        .expect(403);
    });

    it('POST /admin/notifications/dlq/:jobId/replay should return 403 for non-admin user', () => {
      return request(app.getHttpServer())
        .post('/admin/notifications/dlq/123/replay')
        .set('Authorization', `Bearer ${userJwtToken}`)
        .send({ reason: 'test replay' })
        .expect(403);
    });

    it('POST /admin/notifications/dlq/replay should return 403 for non-admin user', () => {
      return request(app.getHttpServer())
        .post('/admin/notifications/dlq/replay')
        .set('Authorization', `Bearer ${userJwtToken}`)
        .send({ limit: 10, reason: 'test bulk replay' })
        .expect(403);
    });
  });

  describe('Protected DLQ endpoints should work for admin users', () => {
    beforeEach(() => {
      // Mock user repository to return admin user
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockAdmin);
    });

    it('GET /admin/notifications/dlq should return DLQ jobs for admin user', () => {
      return request(app.getHttpServer())
        .get('/admin/notifications/dlq')
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockDlqJobs);
          expect(notificationQueue.listDlqJobs).toHaveBeenCalled();
        });
    });

    it('POST /admin/notifications/dlq/:jobId/replay should replay job for admin user', () => {
      return request(app.getHttpServer())
        .post('/admin/notifications/dlq/job1/replay')
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .send({ reason: 'test replay' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({ success: true });
          expect(notificationQueue.replayDlqJob).toHaveBeenCalledWith(
            'job1',
            '1',
            'test replay',
          );
        });
    });

    it('POST /admin/notifications/dlq/replay should replay jobs in bulk for admin user', () => {
      const bulkReplayBody = {
        limit: 10,
        failedAfter: '2023-01-01',
        reason: 'test bulk replay',
      };

      return request(app.getHttpServer())
        .post('/admin/notifications/dlq/replay')
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .send(bulkReplayBody)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({ success: true, count: 1 });
          expect(notificationQueue.replayDlqJobsBulk).toHaveBeenCalledWith(
            '1',
            bulkReplayBody,
          );
        });
    });

    it('GET /admin/notifications/dlq should support query parameters for admin user', () => {
      const queryParams = {
        page: 2,
        limit: 5,
        failedAfter: '2023-01-01',
        failedBefore: '2023-12-31',
        search: 'error',
      };

      return request(app.getHttpServer())
        .get('/admin/notifications/dlq')
        .query(queryParams)
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockDlqJobs);
          expect(notificationQueue.listDlqJobs).toHaveBeenCalledWith(2, 5, {
            failedAfter: '2023-01-01',
            failedBefore: '2023-12-31',
            search: 'error',
          });
        });
    });
  });
});
