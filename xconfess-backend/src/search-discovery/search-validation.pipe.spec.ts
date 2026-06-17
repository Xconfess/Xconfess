import {
  Controller,
  Get,
  INestApplication,
  Query,
  UsePipes,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { SearchConfessionDto } from '../confession/dto/search-confession.dto';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RequestIdMiddleware } from '../middleware/request-id.middleware';
import { searchValidationPipe } from './search-validation.pipe';

@Controller('confessions')
class SearchValidationContractController {
  @Get('search')
  @UsePipes(searchValidationPipe)
  search(@Query() dto: SearchConfessionDto) {
    return {
      q: dto.q,
      page: dto.page,
      limit: dto.limit,
    };
  }
}

describe('Search validation API error contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SearchValidationContractController],
    }).compile();

    app = moduleFixture.createNestApplication();
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const expectErrorEnvelope = (response: Response, expectedStatus: number) => {
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

  it('returns field-level validation details for empty search queries', async () => {
    const response = await request(app.getHttpServer())
      .get('/confessions/search')
      .query({ q: '   ' });

    expectErrorEnvelope(response, 400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.message).toBe('Search query validation failed');
    expect(response.body.details).toEqual({
      fields: [
        {
          field: 'q',
          messages: expect.arrayContaining([
            'q must not be empty',
            'q must contain at least 1 character',
          ]),
        },
      ],
    });
  });

  it('rejects over-max search limits with field-level details', async () => {
    const response = await request(app.getHttpServer())
      .get('/confessions/search')
      .query({ q: 'stress', limit: 51 });

    expectErrorEnvelope(response, 400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'limit',
          messages: expect.arrayContaining([
            'limit must not be greater than 50',
          ]),
        }),
      ]),
    );
  });

  it('rejects unsupported search query characters', async () => {
    const response = await request(app.getHttpServer())
      .get('/confessions/search')
      .query({ q: 'stress\u0007' });

    expectErrorEnvelope(response, 400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'q',
          messages: expect.arrayContaining([
            'q contains unsupported control characters',
          ]),
        }),
      ]),
    );
  });

  it('trims valid search queries before controller handling', async () => {
    const response = await request(app.getHttpServer())
      .get('/confessions/search')
      .query({ q: '  stress  ', limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      q: 'stress',
      page: 1,
      limit: 10,
    });
  });
});
