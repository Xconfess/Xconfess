import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('CSP Regression', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
          },
        },
        frameguard: { action: 'deny' },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Content-Security-Policy header is present on API responses', async () => {
    const response = await request(app.getHttpServer()).get('/api/confessions');
    const cspHeader = response.headers['content-security-policy'];
    expect(cspHeader).toBeDefined();
    expect(typeof cspHeader).toBe('string');
  });

  it('Content-Security-Policy contains required directives', async () => {
    const response = await request(app.getHttpServer()).get('/api/confessions');
    const cspHeader = response.headers['content-security-policy'];
    expect(cspHeader).toContain("default-src 'self'");
    expect(cspHeader).toContain("script-src 'self'");
    expect(cspHeader).toContain("object-src 'none'");
    expect(cspHeader).toContain("frame-src 'none'");
  });

  it('X-Frame-Options header is set to deny', async () => {
    const response = await request(app.getHttpServer()).get('/api/confessions');
    const xFrameOptions = response.headers['x-frame-options'];
    expect(xFrameOptions).toBe('DENY');
  });

  it('X-Content-Type-Options header is set to nosniff', async () => {
    const response = await request(app.getHttpServer()).get('/api/confessions');
    const xContentTypeOptions = response.headers['x-content-type-options'];
    expect(xContentTypeOptions).toBe('nosniff');
  });
});