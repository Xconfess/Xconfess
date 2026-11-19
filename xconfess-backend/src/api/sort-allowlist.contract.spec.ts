import { Controller, Get, INestApplication, Query, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import {
  AUDIT_LOG_SORT_FIELDS,
  AuditLogSortField,
  resolveAuditLogSortColumn,
  resolveReportSortColumn,
  resolveSearchSortExpression,
  validateSortDirection,
  validateSortField,
} from '../common/validation/sort-allowlist';

@Controller('audit-logs')
class SortContractController {
  @Get()
  list(
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return {
      sortBy: validateSortField<AuditLogSortField>(
        sortBy,
        AUDIT_LOG_SORT_FIELDS,
        'createdAt',
      ),
      sortOrder: validateSortDirection(sortOrder),
    };
  }
}

describe('Sort allowlist contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SortContractController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts each documented sort key', async () => {
    for (const field of AUDIT_LOG_SORT_FIELDS) {
      const response = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ sortBy: field, sortOrder: 'ASC' })
        .expect(200);

      expect(response.body).toEqual({ sortBy: field, sortOrder: 'ASC' });
    }
  });

  it('rejects unknown sort keys with allowed values', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ sortBy: 'password' })
      .expect(400);

    expect(response.body).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      details: {
        fields: {
          sortBy: ['Must be one of: createdAt, actor, action, target'],
        },
        allowedValues: ['createdAt', 'actor', 'action', 'target'],
      },
    });
  });

  it('rejects injection-like sort keys and directions', async () => {
    const sortResponse = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ sortBy: 'createdAt; DROP TABLE users' })
      .expect(400);
    const directionResponse = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ sortOrder: 'ASC; DELETE FROM audit_log' })
      .expect(400);

    expect(sortResponse.body.code).toBe('VALIDATION_FAILED');
    expect(directionResponse.body.code).toBe('VALIDATION_FAILED');
  });

  it('falls back to safe columns when services receive untrusted values', () => {
    expect(resolveAuditLogSortColumn('createdAt); DROP TABLE users')).toBe(
      'audit_log.createdAt',
    );
    expect(resolveReportSortColumn('status; TRUNCATE report')).toBe(
      'report.createdAt',
    );
    expect(resolveSearchSortExpression('relevance; DROP TABLE confession')).toBe(
      'relevance DESC',
    );
    expect(resolveSearchSortExpression('trending ASC')).toBe(
      'search_score_tiebreaker ASC',
    );
  });
});
