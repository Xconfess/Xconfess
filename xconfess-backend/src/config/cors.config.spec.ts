import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  buildCorsOptions,
  parseAllowedOrigins,
  resolveAllowedOrigins,
} from './cors.config';

@Controller('cors-probe')
class CorsProbeController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('CORS configuration', () => {
  describe('parseAllowedOrigins', () => {
    it('trims, strips trailing slashes, drops blanks, and de-duplicates', () => {
      expect(
        parseAllowedOrigins(
          ' https://app.xconfess.example/ ,, https://admin.xconfess.example , https://app.xconfess.example ',
        ),
      ).toEqual([
        'https://app.xconfess.example',
        'https://admin.xconfess.example',
      ]);
    });

    it('returns an empty list for missing values', () => {
      expect(parseAllowedOrigins(undefined)).toEqual([]);
      expect(parseAllowedOrigins('  ')).toEqual([]);
    });
  });

  describe('resolveAllowedOrigins', () => {
    it('prefers CORS_ALLOWED_ORIGINS over the single FRONTEND_URL', () => {
      expect(
        resolveAllowedOrigins({
          corsAllowedOrigins: 'https://app.xconfess.example',
          frontendUrl: 'https://legacy.xconfess.example',
        }),
      ).toEqual(['https://app.xconfess.example']);
    });

    it('falls back to FRONTEND_URL when no allowlist is configured', () => {
      expect(
        resolveAllowedOrigins({ frontendUrl: 'https://app.xconfess.example' }),
      ).toEqual(['https://app.xconfess.example']);
    });

    it('falls back to localhost when nothing is configured', () => {
      expect(resolveAllowedOrigins()).toEqual(['http://localhost:3000']);
    });

    it.each(['*', 'https://app.xconfess.example, *'])(
      'rejects wildcard credentials configuration (%s)',
      (corsAllowedOrigins) => {
        expect(() => resolveAllowedOrigins({ corsAllowedOrigins })).toThrow(
          /"\*" cannot be used because credentialed requests are enabled/,
        );
      },
    );
  });

  describe('production-like preflight and credentialed requests', () => {
    const allowedOrigin = 'https://app.xconfess.example';
    const adminOrigin = 'https://admin.xconfess.example';
    const untrustedOrigin = 'https://evil.example';
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [CorsProbeController],
      }).compile();

      app = moduleRef.createNestApplication();
      app.enableCors(
        buildCorsOptions({
          corsAllowedOrigins: `${allowedOrigin}, ${adminOrigin}/`,
          frontendUrl: 'https://legacy.xconfess.example',
        }),
      );
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('answers preflight for a configured origin with credentials allowed', async () => {
      const response = await request(app.getHttpServer())
        .options('/cors-probe')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(
        allowedOrigin,
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('allows the normalized origin (trailing slash removed from config)', async () => {
      const response = await request(app.getHttpServer())
        .options('/cors-probe')
        .set('Origin', adminOrigin)
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-allow-origin']).toBe(adminOrigin);
    });

    it('does not answer preflight for an untrusted origin', async () => {
      const response = await request(app.getHttpServer())
        .options('/cors-probe')
        .set('Origin', untrustedOrigin)
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('returns CORS headers on a credentialed GET from a configured origin', async () => {
      const response = await request(app.getHttpServer())
        .get('/cors-probe')
        .set('Origin', allowedOrigin)
        .set('Cookie', 'session=abc');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(
        allowedOrigin,
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-expose-headers']).toContain(
        'Deprecation',
      );
    });

    it('omits CORS headers for an untrusted origin on actual requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/cors-probe')
        .set('Origin', untrustedOrigin)
        .set('Cookie', 'session=abc');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('serves non-CORS callers that send no Origin header', async () => {
      const response = await request(app.getHttpServer()).get('/cors-probe');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
