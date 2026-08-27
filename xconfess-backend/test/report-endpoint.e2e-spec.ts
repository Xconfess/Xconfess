import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnonymousConfession } from '../src/confession/entities/confession.entity';
import { Report } from '../src/admin/entities/report.entity';
import { User } from '../src/user/entities/user.entity';
import { AnonymousUser } from '../src/user/entities/anonymous-user.entity';
import * as bcrypt from 'bcrypt';
import { CryptoUtil } from '../src/common/crypto.util';
import { DUPLICATE_REPORT_MESSAGE } from '../src/report/reports.service';
import { ReportReason } from '../src/report/enums/report-reason.enum';

describe('Report Endpoint (e2e)', () => {
  let app: INestApplication;
  let confessionRepository: Repository<AnonymousConfession>;
  let reportRepository: Repository<Report>;
  let userRepository: Repository<User>;
  let anonymousUserRepository: Repository<AnonymousUser>;
  let testConfession: AnonymousConfession;
  let testUser: User;
  let testAnonymousUser: AnonymousUser;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    confessionRepository = app.get(getRepositoryToken(AnonymousConfession));
    reportRepository = app.get(getRepositoryToken(Report));
    userRepository = app.get(getRepositoryToken(User));
    anonymousUserRepository = app.get(getRepositoryToken(AnonymousUser));
  });

  beforeEach(async () => {
    // Deterministic cleanup order: reports → confessions → anonymous_users (confession FK) → users
    await reportRepository.delete({});
    await confessionRepository.delete({});
    await anonymousUserRepository.delete({});
    await userRepository.delete({});

    // Create anonymous user for confession owner
    testAnonymousUser = await anonymousUserRepository.save({});

    // Create test confession (required: message, anonymousUser)
    testConfession = await confessionRepository.save({
      message: 'Test confession content for reporting',
      anonymousUser: testAnonymousUser,
    });

    // Create test user with encrypted email so login works (CI-ready)
    const email = 'report-test@example.com';
    const { encrypted, iv, tag } = CryptoUtil.encrypt(email);
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    testUser = await userRepository.save({
      username: 'reporttestuser',
      password: hashedPassword,
      emailEncrypted: encrypted,
      emailIv: iv,
      emailTag: tag,
      emailHash: CryptoUtil.hash(email),
      is_active: true,
    });

    // Login to get a valid JWT for authenticated report tests
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'testpassword' });
    accessToken = loginRes.body?.access_token ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Anonymous report creation', () => {
    it('POST /confessions/:id/report creates report without auth (201)', async () => {
      const payload = {
        reason: ReportReason.SPAM,
        details: 'This appears to be spam content',
      };

      const response = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('x-anonymous-user-id', 'test-anonymous-user-1')
        .send(payload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.confessionId).toBe(testConfession.id);
      expect(response.body.reason).toBe(payload.details);
      expect(response.body.status).toBe('pending');
      expect(response.body.reporterId).toBeNull();
      expect(response.body.anonymousReporterId).toBe('test-anonymous-user-1');
    });

    it('anonymous report returns correct status and message', async () => {
      const response = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('x-anonymous-user-id', 'test-anonymous-user-2')
        .send({ reason: ReportReason.INAPPROPRIATE })
        .expect(201);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('pending');
      expect(response.body.reporterId).toBeNull();
      expect(response.body.anonymousReporterId).toBe('test-anonymous-user-2');
    });
  });

  describe('Authenticated report creation', () => {
    it('POST /confessions/:id/report creates report with valid JWT (201)', async () => {
      const payload = {
        reason: ReportReason.HARASSMENT,
        details: 'Harassing content',
      };

      const response = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.confessionId).toBe(testConfession.id);
      expect(response.body.reporterId).toBe(testUser.id);
      expect(response.body.status).toBe('pending');
    });

    it('authenticated report returns 201 and reporterId set', async () => {
      const response = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: ReportReason.OTHER, details: 'Other reason' })
        .expect(201);

      expect(response.status).toBe(201);
      expect(response.body.reporterId).toBe(testUser.id);
    });
  });

  describe('24-hour duplicate replay safety', () => {
    it('second anonymous report with same anonymous user within 24h returns existing report (idempotent)', async () => {
      const payload = { reason: ReportReason.SPAM, details: 'Spam' };

      const first = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('x-anonymous-user-id', 'same-anonymous-user')
        .send(payload)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('x-anonymous-user-id', 'same-anonymous-user')
        .send(payload)
        .expect(201);

      // Duplicate replay must return the same report ID — no new record created
      expect(second.body.id).toBe(first.body.id);
      expect(second.status).toBe(201);
    });

    it('second anonymous report with different anonymous user succeeds', async () => {
      const payload = { reason: ReportReason.SPAM, details: 'Spam' };

      await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('x-anonymous-user-id', 'anonymous-user-1')
        .send(payload)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('x-anonymous-user-id', 'anonymous-user-2')
        .send(payload)
        .expect(201);

      expect(second.status).toBe(201);
    });

    it('second authenticated report by same user within 24h returns existing report (idempotent)', async () => {
      const payload = { reason: ReportReason.INAPPROPRIATE };

      const first = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(201);

      // Duplicate replay must return the same report ID — no new record created
      expect(second.body.id).toBe(first.body.id);
      expect(second.status).toBe(201);
    });

    it('anonymous then authenticated report both succeed (different reporters)', async () => {
      await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('x-anonymous-user-id', 'anonymous-user-3')
        .send({ reason: ReportReason.SPAM })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: ReportReason.SPAM })
        .expect(201);
    });
  });

  describe('Failure paths', () => {
    it('POST /confessions/:id/report returns 404 for non-existent confession', async () => {
      const res = await request(app.getHttpServer())
        .post('/confessions/00000000-0000-0000-0000-000000000000/report')
        .send({ reason: ReportReason.OTHER })
        .expect(404);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('validates request body (400 for missing reason)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .send({})
        .expect(400);

      expect(res.status).toBe(400);
    });

    it('validates request body (400 for invalid reason)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .send({ reason: 'invalid-reason' })
        .expect(400);

      expect(res.status).toBe(400);
    });

    it('anonymous report without x-anonymous-user-id header returns 400', async () => {
      const res = await request(app.getHttpServer())
        .post(`/confessions/${testConfession.id}/report`)
        .send({ reason: ReportReason.SPAM })
        .expect(400);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'Anonymous reports require x-anonymous-user-id header',
      );
    });
  });
});
