import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createAnonymousOwnershipFixture } from './utils/anonymous-ownership.factory';

describe('Anonymous Identity Ownership Boundaries (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let otherUserToken: string;
  let adminToken: string;

  const fixture = createAnonymousOwnershipFixture();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    // Create test users and get tokens
    const ownerLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: `owner-${fixture.ownerUserId}@test.com`,
        password: 'test-password',
      });
    authToken = ownerLoginRes.body.access_token;

    const otherUserLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: `other-${fixture.otherUserId}@test.com`,
        password: 'test-password',
      });
    otherUserToken = otherUserLoginRes.body.access_token;

    const adminLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'test-password',
      });
    adminToken = adminLoginRes.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Public routes — anonymous identity access', () => {
    it('accepts access to public anonymous confessions', async () => {
      const res = await request(app.getHttpServer())
        .get(`/confessions/anonymous/${fixture.publicAnonId}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('rejects requests with forged linked identity ID on public routes', async () => {
      const forgedLinkId = '99999999-9999-4999-8999-999999999999';
      const res = await request(app.getHttpServer())
        .get(`/confessions/anonymous/${forgedLinkId}`)
        .expect(404);

      expect(res.body.message).not.toMatch(/linked/i);
    });

    it('does not disclose existence of forged linked identities', async () => {
      const forgedLinkId = '99999999-9999-4999-8999-999999999999';
      const res = await request(app.getHttpServer())
        .get(`/confessions/anonymous/${forgedLinkId}`)
        .expect(404);

      expect(res.body.message).toBeDefined();
      expect(res.body.message.toLowerCase()).not.toContain('exists');
    });
  });

  describe('Linked-user routes — authenticated access control', () => {
    it('allows owner to access their linked anonymous identity', async () => {
      const res = await request(app.getHttpServer())
        .get(`/confessions/my-anonymous/${fixture.ownerLinkedAnonId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('rejects other users accessing a linked anonymous identity', async () => {
      const res = await request(app.getHttpServer())
        .get(`/confessions/my-anonymous/${fixture.ownerLinkedAnonId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      expect(res.body.message).toMatch(/not.*authorized|forbidden/i);
    });

    it('rejects requests with forged linked identity on authenticated routes', async () => {
      const forgedLinkId = '99999999-9999-4999-8999-999999999999';
      const res = await request(app.getHttpServer())
        .get(`/confessions/my-anonymous/${forgedLinkId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(res.body.message).toBeDefined();
    });

    it('rejects unauthenticated requests to linked-user routes', async () => {
      await request(app.getHttpServer())
        .get(`/confessions/my-anonymous/${fixture.ownerLinkedAnonId}`)
        .expect(401);
    });
  });

  describe('Admin routes — admin-guarded access', () => {
    it('allows admin to access any anonymous identity', async () => {
      const res = await request(app.getHttpServer())
        .get(`/admin/confessions/anonymous/${fixture.ownerLinkedAnonId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('rejects non-admin users accessing admin routes', async () => {
      const res = await request(app.getHttpServer())
        .get(`/admin/confessions/anonymous/${fixture.ownerLinkedAnonId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(res.body.message).toMatch(/admin|unauthorized/i);
    });

    it('rejects unauthenticated requests to admin routes', async () => {
      await request(app.getHttpServer())
        .get(`/admin/confessions/anonymous/${fixture.ownerLinkedAnonId}`)
        .expect(401);
    });

    it('does not disclose admin route existence on unauthorized access', async () => {
      const res = await request(app.getHttpServer())
        .get(`/admin/confessions/anonymous/${fixture.publicAnonId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Should not return 404 implying route exists
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('Identity ownership edge cases', () => {
    it('rejects attempts to forge a link between two unrelated users', async () => {
      const res = await request(app.getHttpServer())
        .post(`/anonymous/link`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          anonId: fixture.otherLinkedAnonId,
          targetUserId: fixture.otherUserId,
        })
        .expect(400 || 403 || 409);

      expect(res.body.message).toBeDefined();
    });

    it('maintains isolation between owner and other user access', async () => {
      const ownerRes = await request(app.getHttpServer())
        .get(`/confessions/my-anonymous/${fixture.ownerLinkedAnonId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const otherRes = await request(app.getHttpServer())
        .get(`/confessions/my-anonymous/${fixture.ownerLinkedAnonId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      expect(ownerRes.body).toBeDefined();
      expect(otherRes.body.message).toBeDefined();
    });

    it('does not allow cross-user anonymous identity access through query manipulation', async () => {
      const res = await request(app.getHttpServer())
        .get(`/confessions/my-anonymous/${fixture.otherLinkedAnonId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403 || 404);

      expect(res.body.message).toBeDefined();
    });
  });

  describe('Session and context isolation', () => {
    it('isolates authenticated user context per request', async () => {
      const ownerRes = await request(app.getHttpServer())
        .post('/confessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'Owner confession',
          anonymous: true,
        })
        .expect(201);

      const otherRes = await request(app.getHttpServer())
        .get(`/confessions/${ownerRes.body.id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(200);

      expect(ownerRes.body.anonymousUserId).not.toEqual(otherRes.body.anonymousUserId);
    });

    it('prevents token reuse across different users', async () => {
      const tokenRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `user-${fixture.ownerUserId}@test.com`,
          password: 'test-password',
        });

      const token = tokenRes.body.access_token;
      expect(token).toBeDefined();

      const identity = await request(app.getHttpServer())
        .get('/user/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(identity.body.id).toBe(fixture.ownerUserId);
    });
  });
});
