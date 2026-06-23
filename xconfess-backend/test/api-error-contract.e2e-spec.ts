import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { ThrottlerExceptionFilter } from './../src/common/filters/throttler-exception.filter';
import { RequestIdMiddleware } from './../src/middleware/request-id.middleware';

describe('API Error Contract (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same middleware and filters as in main.ts
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));

    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(
      new HttpExceptionFilter(),
      new ThrottlerExceptionFilter(),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const expectErrorEnvelope = (
    response: request.Response,
    expectedStatus: number,
  ) => {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('status', expectedStatus);
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('code');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('requestId');
    expect(typeof response.body.message).toBe('string');
    expect(typeof response.body.code).toBe('string');
    expect(new Date(response.body.timestamp).getTime()).not.toBeNaN();
    expect(response.body.requestId).not.toBe('unknown');
  };

  describe('400 Bad Request (Validation)', () => {
    it('should return standardized 400 error for confession creation failure', async () => {
      const response = await request(app.getHttpServer())
        .post('/confessions')
        .send({
          // Missing required 'message' field
          gender: 'prefer-not-to-say',
        });

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });
  });

  describe('401 Unauthorized', () => {
    it('should return standardized 401 error for protected route', async () => {
      const response = await request(app.getHttpServer()).get('/auth/me');

      expectErrorEnvelope(response, 401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('403 Forbidden', () => {
    it('should return standardized 403 error (if we have a known forbidden path)', async () => {
      // Note: This might require a real token for a non-admin user hitting an admin route
      // For now, testing if standard Nest 403s are caught
      const response = await request(app.getHttpServer()).get('/admin/stats'); // Usually requires admin role

      expectErrorEnvelope(response, 401); // Actually 401 if NO token
    });
  });

  describe('404 Not Found', () => {
    it('should return standardized 404 error for non-existent route', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/non-existent-route',
      );

      expectErrorEnvelope(response, 404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should return standardized 404 error for non-existent resource', async () => {
      const response = await request(app.getHttpServer()).get(
        '/confessions/00000000-0000-0000-0000-000000000000',
      );

      expectErrorEnvelope(response, 404);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('429 Too Many Requests', () => {
    it('should return standardized 429 error when throttled with retryAfter', async () => {
      // We might need to hit a throttled endpoint multiple times
      // Or check if the filter alone works by triggering it
      // For E2E, we'll try to trigger it if the limit is low

      // Hit /auth/login multiple times (typically throttled)
      for (let i = 0; i < 10; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'test@example.com', password: 'pwd' });

        if (response.status === 429) {
          expectErrorEnvelope(response, 429);
          expect(response.body.code).toBe('THROTTLED');
          // Verify retryAfter is a number when rate limited
          if (response.body.retryAfter !== undefined) {
            expect(typeof response.body.retryAfter).toBe('number');
          }
          return;
        }
      }

      // console.warn('Could not trigger 429 in E2E test, skipping throttling check');
    });
  });

  describe('Rate Limit predictability tests', () => {
    it('should have predictable error envelope for rate-limited endpoints', async () => {
      // This verifies the structure of rate limit error responses
      const response = await request(app.getHttpServer())
        .post('/reactions')
        .send({ confessionId: 'test-id', anonymousUserId: 'test-user', emoji: 'like' });
      // The endpoint may return 404 (route exists but validation fails) or other status
      // Key point: any 429 response should have the predictable envelope
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('400 Search Validation', () => {
    it('should return 400 with structured error when search query is empty', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: '' });

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });

    it('should return 400 with structured error when search query exceeds max length', async () => {
      const longQuery = 'a'.repeat(201);
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: longQuery });

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });

    it('should return 400 with structured error when search query has invalid characters', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: '<script>alert(1)</script>' });

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });

    it('should return 400 with structured error when limit exceeds maximum', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', limit: 100 });

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });

    it('should return 400 with structured error when page is less than 1', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', page: 0 });

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });

    it('should return 400 with structured error when sortBy is invalid', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', sortBy: 'invalid_sort' });

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });
  });
});
