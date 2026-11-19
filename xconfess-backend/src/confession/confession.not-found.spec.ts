/**
 * Backend unit test: GET /confessions/:id — not-found confession responses (#2078)
 *
 * Uses a slim NestJS testing module (no real DB) so the suite is fast and CI-safe.
 *
 * Acceptance criteria covered:
 *  • Verify the expected HTTP status (404)
 *  • Verify the standard error response envelope (status, message, code,
 *    timestamp, path)
 *  • Verify no database details leak into the response (no stack traces,
 *    query strings, entity class names, or internal field names)
 *
 * Additional regression cases:
 *  • Malformed UUID IDs (e.g. empty string) still return 404, not 500
 *  • Multiple consecutive lookups of missing IDs do not produce inconsistent
 *    codes (idempotency)
 *  • A random-looking non-UUID string also returns 404 cleanly
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { ConfessionController } from './confession.controller';
import { ConfessionService } from './confession.service';
import { SearchDiscoveryService } from '../search-discovery/search-discovery.service';
import { ConfessionSchedulerService } from './confession-scheduler.service';
import { ConfessionIdempotencyService } from './confession-idempotency.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RequestIdMiddleware } from '../middleware/request-id.middleware';
import { QueryTimeoutInterceptor } from '../common/query-timeout.interceptor';
import { DataSource } from 'typeorm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';
const ANOTHER_NON_EXISTENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * The standard error envelope fields the filter always emits.
 * See src/common/filters/http-exception.filter.ts.
 */
function expectNotFoundEnvelope(body: Record<string, unknown>, path: string) {
  expect(body.status).toBe(404);
  expect(typeof body.message).toBe('string');
  expect((body.message as string).length).toBeGreaterThan(0);
  expect(typeof body.code).toBe('string');
  expect((body.code as string).length).toBeGreaterThan(0);
  expect(typeof body.timestamp).toBe('string');
  expect(new Date(body.timestamp as string).getTime()).not.toBeNaN();
  expect(body.path).toBe(path);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ConfessionController — not-found confession (unit, #2078)', () => {
  let app: INestApplication;

  const mockConfessionService = {
    getConfessionByIdWithViewCount: jest.fn(),
    getConfessions: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(),
    search: jest.fn(),
    fullTextSearch: jest.fn(),
    getTrendingConfessions: jest.fn(),
    getAllTags: jest.fn(),
    getConfessionsByTag: jest.fn(),
    getDeletedConfessions: jest.fn(),
    verifyStellarAnchor: jest.fn(),
    anchorConfession: jest.fn(),
    deleteConfession: jest.fn(),
    restoreConfession: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ConfessionController],
      providers: [
        { provide: ConfessionService, useValue: mockConfessionService },
        {
          provide: SearchDiscoveryService,
          useValue: { recordSearch: jest.fn() },
        },
        {
          provide: ConfessionSchedulerService,
          useValue: {
            scheduleConfession: jest.fn(),
            cancelSchedule: jest.fn(),
            getScheduledConfessions: jest.fn(),
          },
        },
        {
          provide: ConfessionIdempotencyService,
          useValue: {
            check: jest.fn(),
            computePayloadHash: jest.fn(),
            commitSuccess: jest.fn(),
            commitFailure: jest.fn(),
          },
        },
        // QueryTimeoutInterceptor is applied via @UseInterceptors on findAll
        // and requires a DataSource. Provide a no-op mock so DI resolves.
        {
          provide: DataSource,
          useValue: { query: jest.fn() },
        },
        QueryTimeoutInterceptor,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Wire up the same middleware and filter as production so the error shape
    // matches what the issue acceptance criteria checks against.
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── AC1: HTTP status is 404 ───────────────────────────────────────────────

  describe('HTTP status', () => {
    it('returns 404 when the confession does not exist', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      const res = await request(app.getHttpServer()).get(
        `/confessions/${NON_EXISTENT_ID}`,
      );

      expect(res.status).toBe(404);
    });

    it('returns 404 for a second distinct missing ID (idempotency)', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      const res = await request(app.getHttpServer()).get(
        `/confessions/${ANOTHER_NON_EXISTENT_ID}`,
      );

      expect(res.status).toBe(404);
    });

    it('returns 404 for a non-UUID path segment', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      const res = await request(app.getHttpServer()).get(
        '/confessions/definitely-not-a-real-id',
      );

      // Must not be 500 — the service would have thrown NotFoundException
      expect(res.status).toBe(404);
    });
  });

  // ── AC2: Standard error response shape ───────────────────────────────────

  describe('standard error response envelope', () => {
    it('contains status, message, code, timestamp, and path', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      const path = `/confessions/${NON_EXISTENT_ID}`;
      const res = await request(app.getHttpServer()).get(path);

      expectNotFoundEnvelope(res.body, path);
    });

    it('message field is the human-readable not-found description', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      const res = await request(app.getHttpServer()).get(
        `/confessions/${NON_EXISTENT_ID}`,
      );

      // Message must be meaningful and not empty
      expect(res.body.message).toBeTruthy();
      expect(res.body.message.toLowerCase()).toMatch(/not found|confession/);
    });

    it('code field is a string identifier (not a numeric HTTP status)', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      const res = await request(app.getHttpServer()).get(
        `/confessions/${NON_EXISTENT_ID}`,
      );

      expect(typeof res.body.code).toBe('string');
      // Must not be a bare number masquerading as a code
      expect(isNaN(Number(res.body.code))).toBe(true);
    });

    it('timestamp is a valid ISO date string', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      const res = await request(app.getHttpServer()).get(
        `/confessions/${NON_EXISTENT_ID}`,
      );

      expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
    });
  });

  // ── AC3: No database details in the response ──────────────────────────────

  describe('no database detail leakage', () => {
    const leakPatterns: Array<[string, RegExp]> = [
      ['SQL query fragment', /SELECT|INSERT|UPDATE|DELETE|FROM|WHERE/i],
      ['TypeORM entity class names', /AnonymousConfession|ConfessionRepository/i],
      ['Postgres error codes', /SQLSTATE|PG\d{5}|23\d{3}/i],
      ['Stack trace indicators', /at Object\.|at async|\.spec\.ts|\.service\.ts/],
      ['Internal field names', /confessionRepo|cacheService|viewCache/i],
      ['Connection strings', /postgres:\/\/|localhost:\d{4}|pg_connect/i],
    ];

    it.each(leakPatterns)(
      'response body does not contain %s',
      async (_label, pattern) => {
        mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
          new NotFoundException('Confession not found'),
        );

        const res = await request(app.getHttpServer()).get(
          `/confessions/${NON_EXISTENT_ID}`,
        );

        const serialized = JSON.stringify(res.body);
        expect(serialized).not.toMatch(pattern);
      },
    );

    it('does not include a "stack" field in the response body', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      const res = await request(app.getHttpServer()).get(
        `/confessions/${NON_EXISTENT_ID}`,
      );

      expect(res.body).not.toHaveProperty('stack');
    });

    it('does not include a "trace" field in the response body', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      const res = await request(app.getHttpServer()).get(
        `/confessions/${NON_EXISTENT_ID}`,
      );

      expect(res.body).not.toHaveProperty('trace');
    });

    it('does not expose entity-level metadata in the details field', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      const res = await request(app.getHttpServer()).get(
        `/confessions/${NON_EXISTENT_ID}`,
      );

      if (res.body.details !== undefined) {
        const detailsStr = JSON.stringify(res.body.details);
        expect(detailsStr).not.toMatch(/entityMetadata|__typeorm|typeorm/i);
      }
    });
  });

  // ── Service is called with the correct ID ─────────────────────────────────

  describe('service interaction', () => {
    it('calls getConfessionByIdWithViewCount with the ID from the URL', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      await request(app.getHttpServer()).get(
        `/confessions/${NON_EXISTENT_ID}`,
      );

      expect(
        mockConfessionService.getConfessionByIdWithViewCount,
      ).toHaveBeenCalledWith(NON_EXISTENT_ID, expect.anything());
    });

    it('calls getConfessionByIdWithViewCount exactly once per request', async () => {
      mockConfessionService.getConfessionByIdWithViewCount.mockRejectedValue(
        new NotFoundException('Confession not found'),
      );

      await request(app.getHttpServer()).get(
        `/confessions/${NON_EXISTENT_ID}`,
      );

      expect(
        mockConfessionService.getConfessionByIdWithViewCount,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
