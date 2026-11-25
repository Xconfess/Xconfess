import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
} from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import request from 'supertest';
import { DeprecatedApi } from '../decorators/deprecated-api.decorator';
import { DeprecationHeadersInterceptor } from '../deprecation-headers.interceptor';

const OPTIONS = {
  deprecatedAt: '2026-10-21',
  sunsetAt: '2027-04-30',
  successor: '/api/confessions',
  guidance: 'Use cursor pagination instead of ?page=.',
  legacyQueryParam: 'page',
};

const buildHttpContext = (query: Record<string, unknown> = {}) => {
  const setHeader = jest.fn();
  const context = {
    getType: () => 'http',
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => ({ query }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;

  return { context, setHeader };
};

const handler: CallHandler = { handle: () => of({ ok: true }) };

describe('DeprecationHeadersInterceptor', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let interceptor: DeprecationHeadersInterceptor;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(OPTIONS) };
    interceptor = new DeprecationHeadersInterceptor(
      reflector as unknown as Reflector,
    );
  });

  it('sets Deprecation, Sunset and Link headers for a deprecated mode', () => {
    const { context, setHeader } = buildHttpContext({ page: '2' });

    interceptor.intercept(context, handler);

    expect(setHeader).toHaveBeenCalledWith(
      'Deprecation',
      `@${Math.floor(Date.parse(OPTIONS.deprecatedAt) / 1000)}`,
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Sunset',
      new Date(OPTIONS.sunsetAt).toUTCString(),
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Link',
      '</api/confessions>; rel="successor-version"; title="Use cursor pagination instead of ?page=."',
    );
  });

  it('omits the headers when the legacy query parameter is absent', () => {
    const { context, setHeader } = buildHttpContext({ cursor: 'abc' });

    interceptor.intercept(context, handler);

    expect(setHeader).not.toHaveBeenCalled();
  });

  it('omits the headers when no deprecation metadata is declared', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const { context, setHeader } = buildHttpContext({ page: '2' });

    interceptor.intercept(context, handler);

    expect(setHeader).not.toHaveBeenCalled();
  });

  it('always sets headers when no legacy query parameter is configured', () => {
    reflector.getAllAndOverride.mockReturnValue({
      ...OPTIONS,
      legacyQueryParam: undefined,
    });
    const { context, setHeader } = buildHttpContext({});

    interceptor.intercept(context, handler);

    expect(setHeader).toHaveBeenCalledWith('Deprecation', expect.any(String));
  });

  it('ignores non-HTTP contexts', () => {
    const wsContext = {
      getType: () => 'ws',
      switchToHttp: () => {
        throw new Error('should not be called for ws contexts');
      },
    } as unknown as ExecutionContext;

    expect(() => interceptor.intercept(wsContext, handler)).not.toThrow();
  });

  it('fails safely when the response cannot set headers', () => {
    const context = {
      getType: () => 'http',
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({
        getRequest: () => ({ query: { page: '2' } }),
        getResponse: () => undefined,
      }),
    } as unknown as ExecutionContext;

    expect(() => interceptor.intercept(context, handler)).not.toThrow();
  });
});

@Controller('legacy-probe')
class LegacyProbeController {
  @Get('paginated')
  @DeprecatedApi({
    deprecatedAt: '2026-10-21',
    sunsetAt: '2027-04-30',
    successor: '/api/confessions',
    guidance: 'Use cursor pagination (?cursor=...&limit=...) instead of ?page=.',
    legacyQueryParam: 'page',
  })
  paginated() {
    return { ok: true };
  }

  @Get('current')
  current() {
    return { ok: true };
  }
}

describe('Deprecation headers on a live route', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LegacyProbeController],
      providers: [
        {
          provide: APP_INTERCEPTOR,
          useClass: DeprecationHeadersInterceptor,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('adds deprecation headers when the legacy query parameter is used', async () => {
    const response = await request(app.getHttpServer())
      .get('/legacy-probe/paginated')
      .query({ page: 3 });

    expect(response.headers['deprecation']).toBe(
      `@${Math.floor(Date.parse('2026-10-21') / 1000)}`,
    );
    expect(response.headers['sunset']).toBe(
      new Date('2027-04-30').toUTCString(),
    );
    expect(response.headers['link']).toBe(
      '</api/confessions>; rel="successor-version"; title="Use cursor pagination (?cursor=...&limit=...) instead of ?page=."',
    );
  });

  it('does not add deprecation headers for the cursor-based mode', async () => {
    const response = await request(app.getHttpServer())
      .get('/legacy-probe/paginated')
      .query({ cursor: 'abc' });

    expect(response.status).toBe(200);
    expect(response.headers['deprecation']).toBeUndefined();
    expect(response.headers['sunset']).toBeUndefined();
    expect(response.headers['link']).toBeUndefined();
  });

  it('does not add deprecation headers to non-deprecated routes', async () => {
    const response = await request(app.getHttpServer()).get(
      '/legacy-probe/current',
    );

    expect(response.status).toBe(200);
    expect(response.headers['deprecation']).toBeUndefined();
  });
});
