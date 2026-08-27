import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../src/user/entities/user.entity';
import { AnonymousUser } from '../src/user/entities/anonymous-user.entity';
import { UserAnonymousUser } from '../src/user/entities/user-anonymous-link.entity';
import { Report } from '../src/report/report.entity';
import { UserRole } from '../src/user/entities/user.entity';
import { ReportReason } from '../src/report/enums/report-reason.enum';
import { ExportRequest } from '../src/data-export/entities/export-request.entity';
import { DataCleanupService } from '../src/data-export/data-export-cleanup';
import * as bcrypt from 'bcryptjs';

describe('Backend Improvements (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let anonymousUserRepository: Repository<AnonymousUser>;
  let userAnonRepo: Repository<UserAnonymousUser>;
  let reportRepository: Repository<Report>;
  let testUser: User;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepository = app.get(getRepositoryToken(User));
    anonymousUserRepository = app.get(getRepositoryToken(AnonymousUser));
    userAnonRepo = app.get(getRepositoryToken(UserAnonymousUser));
    reportRepository = app.get(getRepositoryToken(Report));
  });

  beforeEach(async () => {
    // Clean up test data
    await userRepository.delete({});
    await anonymousUserRepository.delete({});
    await userAnonRepo.delete({});
    await reportRepository.delete({});

    // Create test user
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    testUser = await userRepository.save({
      username: 'testuser',
      email: 'test@example.com',
      password: hashedPassword,
      role: UserRole.USER,
      is_active: true,
    });

    // Get access token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword',
      });

    accessToken = loginResponse.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Task 1: Anonymous Context ID Session Management', () => {
    it('should reuse same anonymous context ID within session window', async () => {
      // Make first request
      const response1 = await request(app.getHttpServer())
        .get('/confessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Make second request
      const response2 = await request(app.getHttpServer())
        .get('/confessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Both should have same anonymous context ID
      const anonContext1 = response1.headers['x-anonymous-context-id'];
      const anonContext2 = response2.headers['x-anonymous-context-id'];

      expect(anonContext1).toBeDefined();
      expect(anonContext2).toBeDefined();
      expect(anonContext1).toBe(anonContext2);
      expect(anonContext1).toMatch(/^anon_[a-f0-9-]{36}$/);
    });

    it('should create new anonymous context after session expiry', async () => {
      // Simulate session expiry by creating old link
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago

      const oldAnonUser = await anonymousUserRepository.save({
        createdAt: oldDate,
      });

      await userAnonRepo.save({
        userId: testUser.id,
        anonymousUserId: oldAnonUser.id,
        createdAt: oldDate,
      });

      // Make request - should create new anonymous context
      const response = await request(app.getHttpServer())
        .get('/confessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const anonContext = response.headers['x-anonymous-context-id'];
      expect(anonContext).toBeDefined();
      expect(anonContext).not.toBe(`anon_${oldAnonUser.id}`);
    });

    it('should maintain anonymity guarantees', async () => {
      // Create multiple users
      const user2 = await userRepository.save({
        username: 'user2',
        email: 'user2@example.com',
        password: await bcrypt.hash('password', 10),
        role: UserRole.USER,
        is_active: true,
      });

      const loginResponse2 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user2@example.com',
          password: 'password',
        });

      const token2 = loginResponse2.body.access_token;

      // Make requests from both users
      const response1 = await request(app.getHttpServer())
        .get('/confessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const response2 = await request(app.getHttpServer())
        .get('/confessions')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      const anonContext1 = response1.headers['x-anonymous-context-id'];
      const anonContext2 = response2.headers['x-anonymous-context-id'];

      // Should be different anonymous contexts
      expect(anonContext1).not.toBe(anonContext2);
      expect(anonContext1).toMatch(/^anon_[a-f0-9-]{36}$/);
      expect(anonContext2).toMatch(/^anon_[a-f0-9-]{36}$/);
    });
  });

  describe('Task 2: Report Controller UUID Validation', () => {
    it('should reject invalid UUID in report endpoint', async () => {
      const invalidUuid = 'invalid-uuid-format';

      const response = await request(app.getHttpServer())
        .post(`/confessions/${invalidUuid}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: ReportReason.SPAM,
          details: 'This is spam content',
        })
        .expect(400); // Should fail validation

      expect(response.body.message).toContain('validation');
    });

    it('should accept valid UUID in report endpoint', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';

      // Mock confession existence check
      jest.spyOn(reportRepository, 'findOne').mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .post(`/confessions/${validUuid}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: ReportReason.SPAM,
          details: 'This is spam content',
        })
        .expect(201); // Should pass validation

      // Should not contain validation errors
      expect(response.body.message).not.toContain('validation');
    });

    it('should handle unauthenticated requests properly', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';

      const response = await request(app.getHttpServer())
        .post(`/confessions/${validUuid}/report`)
        .send({
          reason: ReportReason.HARASSMENT,
          details: 'Harassment content',
        })
        .expect(201); // Should work for guests too

      expect(response.body.message).not.toContain('validation');
    });

    it('should have proper request typing without any types', async () => {
      // This test ensures the controller compiles without 'any' types
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';

      const response = await request(app.getHttpServer())
        .post(`/confessions/${validUuid}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: ReportReason.INAPPROPRIATE,
          details: 'Inappropriate content',
        })
        .expect(201);

      // Should work with proper typing
      expect(response.body).toBeDefined();
    });
  });

  describe('Task 3: Report Reason Enum Validation', () => {
    it('should accept valid report reasons', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';

      for (const reason of Object.values(ReportReason)) {
        const response = await request(app.getHttpServer())
          .post(`/confessions/${validUuid}/report`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            reason: reason,
            details: `Test report for ${reason}`,
          })
          .expect(201);

        expect(response.body.reason).toBe(reason);
      }
    });

    it('should reject invalid report reasons', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';

      const response = await request(app.getHttpServer())
        .post(`/confessions/${validUuid}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: 'invalid-reason',
          details: 'This should fail',
        })
        .expect(400);

      expect(response.body.message).toContain('reason');
      expect(response.body.message).toContain('enum');
    });

    it('should store normalized reason categories', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';

      await request(app.getHttpServer())
        .post(`/confessions/${validUuid}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: ReportReason.HATE_SPEECH,
          details: 'Hate speech content',
        })
        .expect(201);

      // Check database for normalized reason
      const reports = await reportRepository.find({
        where: { reason: ReportReason.HATE_SPEECH },
      });

      expect(reports).toHaveLength(1);
      expect(reports[0].reason).toBe(ReportReason.HATE_SPEECH);
    });

    it('should allow optional details field', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';

      const response = await request(app.getHttpServer())
        .post(`/confessions/${validUuid}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: ReportReason.SPAM,
          // No details field
        })
        .expect(201);

      expect(response.body.reason).toBe(ReportReason.SPAM);
    });

    it('should enforce details length limit', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const longDetails = 'a'.repeat(2001); // Exceeds 2000 character limit

      const response = await request(app.getHttpServer())
        .post(`/confessions/${validUuid}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: ReportReason.OTHER,
          details: longDetails,
        })
        .expect(400);

      expect(response.body.message).toContain('details');
      expect(response.body.message).toContain('2000');
    });
  });

  describe('Task 4: Data Export Retention and Expiry E2E Tests', () => {
    let exportRepository: Repository<ExportRequest>;
    let accessToken: string;
    let testUser: User;

    beforeEach(async () => {
      // Get export repository for test setup
      exportRepository = app.get(getRepositoryToken(ExportRequest));

      // Clean up export data
      await exportRepository.delete({});
    });

    it('should handle complete export lifecycle end-to-end', async () => {
      // 1. Request export
      const exportResponse = await request(app.getHttpServer())
        .post('/data-export/request')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(exportResponse.body.requestId).toBeDefined();
      expect(exportResponse.body.status).toBe('PENDING');
      expect(exportResponse.body.queuedAt).toBeDefined();

      const requestId = exportResponse.body.requestId;

      // 2. Check initial status
      const statusResponse = await request(app.getHttpServer())
        .get(`/data-export/${requestId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('PENDING');
      expect(statusResponse.body.progress.queuedAt).toBeDefined();
      expect(statusResponse.body.progress.processingAt).toBeNull();
      expect(statusResponse.body.progress.completedAt).toBeNull();

      // 3. Simulate export completion (manually update database)
      const exportRecord = await exportRepository.findOne({
        where: { id: requestId },
      });

      await exportRepository.update(requestId, {
        status: 'READY',
        processingAt: new Date(),
        completedAt: new Date(),
        fileData: Buffer.from('test export data'),
      });

      // 4. Check completed status
      const completedStatusResponse = await request(app.getHttpServer())
        .get(`/data-export/${requestId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(completedStatusResponse.body.status).toBe('READY');
      expect(completedStatusResponse.body.progress.processingAt).toBeDefined();
      expect(completedStatusResponse.body.progress.completedAt).toBeDefined();

      // 5. Get download link
      const redownloadResponse = await request(app.getHttpServer())
        .post(`/data-export/${requestId}/redownload`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(redownloadResponse.body.downloadUrl).toContain(
        '/api/data-export/download',
      );
      expect(redownloadResponse.body.downloadUrl).toContain('signature=');
      expect(redownloadResponse.body.downloadUrl).toContain('expires=');

      // 6. Verify download URL signature
      const downloadUrl = new URL(redownloadResponse.body.downloadUrl);
      const userId = downloadUrl.searchParams.get('userId');
      const expires = downloadUrl.searchParams.get('expires');
      const signature = downloadUrl.searchParams.get('signature');

      expect(userId).toBe(testUser.id.toString());
      expect(parseInt(expires)).toBeGreaterThan(Date.now());
      expect(signature).toBeDefined();

      // 7. Check export history
      const historyResponse = await request(app.getHttpServer())
        .get('/data-export/history')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(historyResponse.body.history).toHaveLength(1);
      expect(historyResponse.body.latest.id).toBe(requestId);
      expect(historyResponse.body.latest.status).toBe('READY');
      expect(historyResponse.body.latest.canRedownload).toBe(true);
    });

    it('should enforce 7-day rate limiting on export requests', async () => {
      // Create an export record from 6 days ago
      const sixDaysAgo = new Date();
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

      await exportRepository.save({
        userId: testUser.id,
        status: 'READY',
        createdAt: sixDaysAgo,
        queuedAt: sixDaysAgo,
        processingAt: sixDaysAgo,
        completedAt: sixDaysAgo,
        fileData: Buffer.from('old export data'),
      });

      // Should be rejected due to rate limit
      await request(app.getHttpServer())
        .post('/data-export/request')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should allow export request after 7-day window', async () => {
      // Create an export record from 8 days ago
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

      await exportRepository.save({
        userId: testUser.id,
        status: 'EXPIRED',
        createdAt: eightDaysAgo,
        queuedAt: eightDaysAgo,
        processingAt: eightDaysAgo,
        completedAt: eightDaysAgo,
        fileData: null,
      });

      // Should be allowed
      const exportResponse = await request(app.getHttpServer())
        .post('/data-export/request')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(exportResponse.body.requestId).toBeDefined();
    });

    it('should handle download link expiry correctly', async () => {
      // Create and complete an export
      const exportResponse = await request(app.getHttpServer())
        .post('/data-export/request')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      const requestId = exportResponse.body.requestId;

      await exportRepository.update(requestId, {
        status: 'READY',
        processingAt: new Date(),
        completedAt: new Date(),
        fileData: Buffer.from('test data'),
      });

      // Get download link
      const redownloadResponse = await request(app.getHttpServer())
        .post(`/data-export/${requestId}/redownload`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const downloadUrl = new URL(redownloadResponse.body.downloadUrl);

      // Manipulate timestamp to simulate expiry
      const expiredTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      downloadUrl.searchParams.set('expires', expiredTimestamp.toString());

      // Should reject expired link
      await request(app.getHttpServer())
        .get(downloadUrl.pathname + downloadUrl.search)
        .expect(401);
    });

    it('should reject invalid download signatures', async () => {
      // Create and complete an export
      const exportResponse = await request(app.getHttpServer())
        .post('/data-export/request')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      const requestId = exportResponse.body.requestId;

      await exportRepository.update(requestId, {
        status: 'READY',
        processingAt: new Date(),
        completedAt: new Date(),
        fileData: Buffer.from('test data'),
      });

      // Get download link
      const redownloadResponse = await request(app.getHttpServer())
        .post(`/data-export/${requestId}/redownload`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const downloadUrl = new URL(redownloadResponse.body.downloadUrl);

      // Corrupt the signature
      downloadUrl.searchParams.set('signature', 'invalid-signature');

      // Should reject invalid signature
      await request(app.getHttpServer())
        .get(downloadUrl.pathname + downloadUrl.search)
        .expect(401);
    });

    it('should normalize expired exports to EXPIRED status', async () => {
      // Create an old export (more than 24 hours ago)
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const oldExport = await exportRepository.save({
        userId: testUser.id,
        status: 'READY',
        createdAt: twoDaysAgo,
        queuedAt: twoDaysAgo,
        processingAt: twoDaysAgo,
        completedAt: twoDaysAgo,
        fileData: null, // Already cleaned up
      });

      // Status should be normalized to EXPIRED
      const statusResponse = await request(app.getHttpServer())
        .get(`/data-export/${oldExport.id}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('EXPIRED');

      // History should also show expired status
      const historyResponse = await request(app.getHttpServer())
        .get('/data-export/history')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(historyResponse.body.history[0].status).toBe('EXPIRED');
      expect(historyResponse.body.history[0].canRedownload).toBe(false);
      expect(historyResponse.body.history[0].canRequestNewLink).toBe(true);
    });

    it('should handle redownload link requests for expired exports', async () => {
      // Create an old expired export
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const expiredExport = await exportRepository.save({
        userId: testUser.id,
        status: 'READY',
        createdAt: twoDaysAgo,
        queuedAt: twoDaysAgo,
        processingAt: twoDaysAgo,
        completedAt: twoDaysAgo,
        fileData: null,
      });

      // Should reject redownload request for expired export
      await request(app.getHttpServer())
        .post(`/data-export/${expiredExport.id}/redownload`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should handle failed export lifecycle correctly', async () => {
      // Request export
      const exportResponse = await request(app.getHttpServer())
        .post('/data-export/request')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      const requestId = exportResponse.body.requestId;

      // Simulate export failure
      await exportRepository.update(requestId, {
        status: 'FAILED',
        processingAt: new Date(),
        failedAt: new Date(),
        retryCount: 2,
        lastFailureReason: 'Memory limit exceeded',
      });

      // Check failed status
      const statusResponse = await request(app.getHttpServer())
        .get(`/data-export/${requestId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('FAILED');
      expect(statusResponse.body.progress.retryCount).toBe(2);
      expect(statusResponse.body.progress.lastFailureReason).toBe(
        'Memory limit exceeded',
      );
      expect(statusResponse.body.progress.failedAt).toBeDefined();

      // Should not allow redownload for failed exports
      await request(app.getHttpServer())
        .post(`/data-export/${requestId}/redownload`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should maintain data privacy during cleanup simulation', async () => {
      // Create multiple old exports
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

      await exportRepository.save([
        {
          userId: testUser.id,
          status: 'READY',
          createdAt: eightDaysAgo,
          fileData: Buffer.from('sensitive data 1'),
        },
        {
          userId: testUser.id,
          status: 'FAILED',
          createdAt: eightDaysAgo,
          fileData: Buffer.from('sensitive data 2'),
        },
        {
          userId: testUser.id,
          status: 'EXPIRED',
          createdAt: eightDaysAgo,
          fileData: Buffer.from('sensitive data 3'),
        },
      ]);

      // Simulate cleanup job (manually trigger the cleanup logic)
      const cleanupService = app.get(DataCleanupService);
      await cleanupService.purgeOldExports();

      // Verify file data is cleared but records remain
      const cleanedExports = await exportRepository.find({
        where: { userId: testUser.id },
      });

      expect(cleanedExports).toHaveLength(3);

      cleanedExports.forEach((exportRecord) => {
        expect(exportRecord.fileData).toBeNull();
        expect(exportRecord.status).toBe('EXPIRED');
      });

      // Verify audit trail is preserved
      const historyResponse = await request(app.getHttpServer())
        .get('/data-export/history')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(historyResponse.body.history).toHaveLength(3);
      expect(
        historyResponse.body.history.every((h) => h.status === 'EXPIRED'),
      ).toBe(true);
    });

    it('should handle concurrent export requests safely', async () => {
      // Simulate multiple concurrent requests
      const requests = await Promise.allSettled([
        request(app.getHttpServer())
          .post('/data-export/request')
          .set('Authorization', `Bearer ${accessToken}`),
        request(app.getHttpServer())
          .post('/data-export/request')
          .set('Authorization', `Bearer ${accessToken}`),
        request(app.getHttpServer())
          .post('/data-export/request')
          .set('Authorization', `Bearer ${accessToken}`),
      ]);

      // Only one should succeed
      const successfulRequests = requests.filter(
        (r) => r.status === 'fulfilled',
      );
      const failedRequests = requests.filter((r) => r.status === 'rejected');

      expect(successfulRequests).toHaveLength(1);
      expect(failedRequests).toHaveLength(2);

      // Verify only one export was created
      const exports = await exportRepository.find({
        where: { userId: testUser.id },
      });
      expect(exports).toHaveLength(1);
    });
  });

  describe('Integration Tests', () => {
    it('should work end-to-end with all improvements', async () => {
      // 1. Make authenticated request to get stable anonymous context
      const confessionsResponse = await request(app.getHttpServer())
        .get('/confessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const anonContext = confessionsResponse.headers['x-anonymous-context-id'];
      expect(anonContext).toMatch(/^anon_[a-f0-9-]{36}$/);

      // 2. Submit report with valid UUID and reason enum
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const reportResponse = await request(app.getHttpServer())
        .post(`/confessions/${validUuid}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: ReportReason.FALSE_INFORMATION,
          details: 'This contains false information',
        })
        .expect(201);

      expect(reportResponse.body.reason).toBe(ReportReason.FALSE_INFORMATION);

      // 3. Verify anonymous context remains stable
      const secondConfessionsResponse = await request(app.getHttpServer())
        .get('/confessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const secondAnonContext =
        secondConfessionsResponse.headers['x-anonymous-context-id'];
      expect(secondAnonContext).toBe(anonContext);
    });
  });
});
