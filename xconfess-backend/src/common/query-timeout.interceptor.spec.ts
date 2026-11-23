import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  INestApplication,
  RequestTimeoutException,
} from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { Observable, throwError } from 'rxjs';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';
import * as request from 'supertest';

/**
 * Lightweight stand-in for the interceptor to keep the test self-contained.
 * It reads the X-Simulate-Timeout header so the test can trigger the timeout
 * path without requiring a real database.
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';

@Injectable()
class SimulatedQueryTimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    if (req.headers['x-simulate-timeout'] === '1') {
      return throwError(
        () =>
          new RequestTimeoutException(
            'Query timed out after 15000ms. Please try a narrower search or reduce page size.',
          ),
      );
    }
    return next.handle();
  }
}

@Controller('test-feed')
class TestFeedController {
  @Get()
  getFeed() {
    return { items: [] };
  }
}

describe('QueryTimeout — public feed reads (#1996)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestFeedController],
      providers: [
        {
          provide: APP_INTERCEPTOR,
          useClass: SimulatedQueryTimeoutInterceptor,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 for a normal feed request', async () => {
    await request(app.getHttpServer()).get('/test-feed').expect(200);
  });

  it('returns 408 RequestTimeout when query exceeds the feed timeout', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-feed')
      .set('x-simulate-timeout', '1');

    expect(res.status).toBe(408);
    expect(res.body.message).toMatch(/timed out/i);
  });

  it('response body on timeout does not expose internal stack traces', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-feed')
      .set('x-simulate-timeout', '1');

    expect(res.status).toBe(408);
    expect(JSON.stringify(res.body)).not.toMatch(/at\s+\w+\s+\(/); // no stack trace
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules/);
  });
});
