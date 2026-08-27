import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

describe('DLQ Security (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Legacy DLQ endpoints should require authentication and admin authorization', () => {
    it('GET /admin/dlq should return 401 without auth', () => {
      return request(app.getHttpServer()).get('/admin/dlq').expect(401);
    });

    it('GET /admin/dlq/:id should return 401 without auth', () => {
      return request(app.getHttpServer()).get('/admin/dlq/123').expect(401);
    });

    it('POST /admin/dlq/:id/retry should return 401 without auth', () => {
      return request(app.getHttpServer())
        .post('/admin/dlq/123/retry')
        .expect(401);
    });

    it('DELETE /admin/dlq/:id should return 401 without auth', () => {
      return request(app.getHttpServer()).delete('/admin/dlq/123').expect(401);
    });

    it('DELETE /admin/dlq should return 401 without auth', () => {
      return request(app.getHttpServer()).delete('/admin/dlq').expect(401);
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
});
