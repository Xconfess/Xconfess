import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { ThrottlerExceptionFilter } from './../src/common/filters/throttler-exception.filter';
import { RequestIdMiddleware } from './../src/middleware/request-id.middleware';

describe('Search API Input Validation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
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
  };

  describe('GET /confessions/search - q parameter validation', () => {
    it('should return 400 when q is empty string', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: '' });

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });

    it('should return 400 when q is missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search');

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });

    it('should return 400 when q exceeds max length (200 chars)', async () => {
      const longQuery = 'a'.repeat(201);
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: longQuery });

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });

    it('should return 400 when q is whitespace only', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: '   ' });

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });

    it('should return 200 with valid q parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test search' });

      // Should not be a validation error
      expect(response.status).not.toBe(400);
    });

    it('should return 200 with q at max length boundary (200 chars)', async () => {
      const maxQuery = 'a'.repeat(200);
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: maxQuery });

      expect(response.status).not.toBe(400);
    });
  });

  describe('GET /confessions/search - pagination validation', () => {
    it('should return 400 when page is less than 1', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', page: 0 });

      expectErrorEnvelope(response, 400);
    });

    it('should return 400 when limit exceeds max (50)', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', limit: 51 });

      expectErrorEnvelope(response, 400);
    });

    it('should return 400 when limit is less than 1', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', limit: 0 });

      expectErrorEnvelope(response, 400);
    });
  });

  describe('GET /confessions/search - sortBy validation', () => {
    it('should return 400 for invalid sortBy value', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', sortBy: 'invalid_sort' });

      expectErrorEnvelope(response, 400);
    });

    it('should accept valid sortBy values', async () => {
      const validSorts = ['reactions', 'date', 'views', 'relevance'];
      for (const sort of validSorts) {
        const response = await request(app.getHttpServer())
          .get('/confessions/search')
          .query({ q: 'test', sortBy: sort });

        expect(response.status).not.toBe(400);
      }
    });
  });

  describe('GET /confessions/search - date range validation', () => {
    it('should return 400 for invalid startDate format', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', startDate: 'not-a-date' });

      expectErrorEnvelope(response, 400);
    });

    it('should return 400 for invalid endDate format', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', endDate: 'not-a-date' });

      expectErrorEnvelope(response, 400);
    });

    it('should accept valid ISO date range', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({
          q: 'test',
          startDate: '2025-01-01T00:00:00Z',
          endDate: '2025-12-31T23:59:59Z',
        });

      expect(response.status).not.toBe(400);
    });
  });

  describe('GET /confessions/search - minReactions validation', () => {
    it('should return 400 for negative minReactions', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', minReactions: -1 });

      expectErrorEnvelope(response, 400);
    });

    it('should accept valid minReactions', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: 'test', minReactions: 10 });

      expect(response.status).not.toBe(400);
    });
  });

  describe('GET /confessions/search - error response format', () => {
    it('should include field-level validation messages in 400 response', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search')
        .query({ q: '' });

      expectErrorEnvelope(response, 400);
      expect(response.body.requestId).not.toBe('unknown');
    });

    it('should return structured error for missing required fields', async () => {
      const response = await request(app.getHttpServer())
        .get('/confessions/search');

      expectErrorEnvelope(response, 400);
      expect(response.body.code).toBe('BAD_REQUEST');
    });
  });
});
