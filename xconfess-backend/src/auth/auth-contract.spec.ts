/**
 * auth-contract.spec.ts
 *
 * API contract tests for canonical auth routes.
 * Issue: https://github.com/Xconfess/Xconfess/issues/1736
 *
 * These tests mount a real NestJS HTTP server (via supertest) with all
 * external dependencies mocked, so they exercise the full HTTP pipeline:
 * ValidationPipe, guards, exception filters, and response serialisation.
 *
 * Routes under test:
 *   POST /users/register  — registration (issue alias: /users/register)
 *   POST /users/login     — login        (frontend alias: /auth/login)
 *   GET  /users/profile   — session      (frontend alias: /auth/session)
 *
 * Run:
 *   npm run test --workspace=xconfess-backend -- auth-contract --runInBand
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';

import { UserController } from '../user/user.controller';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExpressAdapter } from '@nestjs/platform-express';
import { CryptoUtil } from '../common/crypto.util';
import { UserRole } from '../user/entities/user.entity';

// ─── Shared test secret (matches what JwtModule is configured with) ──────────
const TEST_JWT_SECRET = 'test-contract-secret-32-chars-!!';

// ─── Stable mock user returned by services ───────────────────────────────────
const emailPlain = 'contract@example.com';
const emailEnc = CryptoUtil.encrypt(emailPlain);

const mockUserEntity = {
  id: 42,
  username: 'contractuser',
  emailEncrypted: emailEnc.encrypted,
  emailIv: emailEnc.iv,
  emailTag: emailEnc.tag,
  emailHash: CryptoUtil.hash(emailPlain),
  password: 'hashed-password',
  role: UserRole.USER,
  is_active: true,
  resetPasswordToken: null,
  resetPasswordExpires: null,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

// The public-facing shape that controllers return (no secrets)
const expectedUserShape = {
  id: mockUserEntity.id,
  username: mockUserEntity.username,
  email: emailPlain,
  role: UserRole.USER,
  is_active: true,
  resetPasswordToken: null,
  resetPasswordExpires: null,
  createdAt: mockUserEntity.createdAt.toISOString(),
  updatedAt: mockUserEntity.updatedAt.toISOString(),
};

// ─── Private fields that must NEVER appear in any auth response ───────────────
const FORBIDDEN_FIELDS = [
  'password',
  'emailEncrypted',
  'emailIv',
  'emailTag',
  'emailHash',
];

// ─── Helper: sign a JWT the same way the real app would ──────────────────────
function signTestToken(payload: object = { sub: '42', email: emailPlain }): string {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
}

// ─── App bootstrap ────────────────────────────────────────────────────────────
async function buildApp(): Promise<INestApplication> {
  // Mock services — no DB, no crypto, no email
  const mockUserService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    setResetPasswordToken: jest.fn(),
    updatePassword: jest.fn(),
    deactivateAccount: jest.fn(),
    reactivateAccount: jest.fn(),
    updateProfile: jest.fn(),
  };

  const mockAuthService = {
    login: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    validateUser: jest.fn(),
  };

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      // Provide JWT_SECRET to ConfigService so JwtStrategy can read it
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '1h' } }),
    ],
    controllers: [UserController],
    providers: [
      { provide: UserService,  useValue: mockUserService  },
      { provide: AuthService,  useValue: mockAuthService  },
      // JwtStrategy needs ConfigService + UserService; override ConfigService inline
      {
        provide: ConfigService,
        useValue: { get: (key: string) => key === 'JWT_SECRET' ? TEST_JWT_SECRET : undefined },
      },
      JwtStrategy,
      JwtAuthGuard,
    ],
  }).compile();

  const app = moduleFixture.createNestApplication(new ExpressAdapter());
  // Enable ValidationPipe so class-validator decorators on DTOs fire over HTTP
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  );
  await app.init();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Auth Contract Tests', () => {
  let app: INestApplication;
  let userService: UserService;
  let authService: AuthService;

  beforeAll(async () => {
    app = await buildApp();
    userService = app.get<UserService>(UserService);
    authService = app.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /users/register
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /users/register', () => {
    const validBody = {
      email: emailPlain,
      password: 'Password1!',
      username: 'contractuser',
    };

    it('returns 201 and the correct response shape on a valid payload', async () => {
      (userService.findByEmail as jest.Mock).mockResolvedValue(null);
      (userService.create as jest.Mock).mockResolvedValue(mockUserEntity);

      const res = await request(app.getHttpServer())
        .post('/users/register')
        .send(validBody)
        .expect(201);

      // Shape assertions
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        username: expect.any(String),
        email: expect.any(String),
        is_active: expect.any(Boolean),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      // Secret fields must be absent
      for (const field of FORBIDDEN_FIELDS) {
        expect(res.body).not.toHaveProperty(field);
      }

      // Email must be the plaintext version, not encrypted
      expect(res.body.email).toBe(emailPlain);
    });

    it('returns 400 when email is missing', async () => {
      const { email: _omit, ...bodyWithoutEmail } = validBody;
      await request(app.getHttpServer())
        .post('/users/register')
        .send(bodyWithoutEmail)
        .expect(400);
    });

    it('returns 400 when email format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/users/register')
        .send({ ...validBody, email: 'not-an-email' })
        .expect(400);
    });

    it('returns 400 when password is shorter than 8 characters', async () => {
      await request(app.getHttpServer())
        .post('/users/register')
        .send({ ...validBody, password: 'short' })
        .expect(400);
    });

    it('returns 400 when username is missing', async () => {
      const { username: _omit, ...bodyWithoutUsername } = validBody;
      await request(app.getHttpServer())
        .post('/users/register')
        .send(bodyWithoutUsername)
        .expect(400);
    });

    it('returns 409 Conflict when the email is already registered', async () => {
      (userService.findByEmail as jest.Mock).mockResolvedValue(mockUserEntity);

      await request(app.getHttpServer())
        .post('/users/register')
        .send(validBody)
        .expect(409);
    });

    it('GET /users/register returns 404 (method not supported)', async () => {
      await request(app.getHttpServer())
        .get('/users/register')
        .expect(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /users/login  (frontend alias: /auth/login)
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /users/login  (frontend alias: /auth/login)', () => {
    const validBody = { email: emailPlain, password: 'Password1!' };

    const loginSuccess = {
      access_token: 'mock-jwt-token',
      user: expectedUserShape,
      anonymousUserId: 'anon-uuid-123',
    };

    it('returns 200 with access_token, user shape, and anonymousUserId on valid credentials', async () => {
      (authService.login as jest.Mock).mockResolvedValue(loginSuccess);

      const res = await request(app.getHttpServer())
        .post('/users/login')
        .send(validBody)
        .expect(200);

      // Top-level shape
      expect(res.body).toHaveProperty('access_token');
      expect(typeof res.body.access_token).toBe('string');
      expect(res.body.access_token.length).toBeGreaterThan(0);

      expect(res.body).toHaveProperty('anonymousUserId');

      // Nested user shape
      expect(res.body.user).toMatchObject({
        id: expect.any(Number),
        username: expect.any(String),
        email: expect.any(String),
        is_active: expect.any(Boolean),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      // Secret fields absent from user object
      for (const field of FORBIDDEN_FIELDS) {
        expect(res.body.user).not.toHaveProperty(field);
      }
    });

    it('returns 401 Unauthorized on wrong password', async () => {
      (authService.login as jest.Mock).mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await request(app.getHttpServer())
        .post('/users/login')
        .send({ email: emailPlain, password: 'wrongpassword' })
        .expect(401);
    });

    it('returns 400 when email is missing', async () => {
      await request(app.getHttpServer())
        .post('/users/login')
        .send({ password: 'Password1!' })
        .expect(400);
    });

    it('returns 400 when password is missing', async () => {
      await request(app.getHttpServer())
        .post('/users/login')
        .send({ email: emailPlain })
        .expect(400);
    });

    it('returns 400 when email format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/users/login')
        .send({ email: 'not-an-email', password: 'Password1!' })
        .expect(400);
    });

    it('GET /users/login returns 404 (method not supported)', async () => {
      await request(app.getHttpServer())
        .get('/users/login')
        .expect(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /users/profile  (frontend alias: /auth/session)
  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /users/profile  (frontend alias: /auth/session)', () => {
    it('returns 200 and the user shape when a valid JWT Bearer token is provided', async () => {
      // JwtStrategy.validate() calls userService.findById — mock it
      (userService.findById as jest.Mock).mockResolvedValue(mockUserEntity);

      // GetUser decorator injects req.user from JwtStrategy.validate().
      // The guard attaches { userId, username, role } — then GetUser picks it up.
      // getProfile() calls CryptoUtil.decrypt on req.user, so we need the full entity.
      // Override the guard to inject the full mockUserEntity as req.user:
      const guard = app.get<JwtAuthGuard>(JwtAuthGuard);
      jest.spyOn(guard, 'canActivate').mockImplementation((context) => {
        const req = context.switchToHttp().getRequest();
        req.user = mockUserEntity; // inject full entity so getProfile() can decrypt
        return true;
      });

      const token = signTestToken();

      const res = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        username: expect.any(String),
        email: expect.any(String),
        is_active: expect.any(Boolean),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      // Secret fields must be absent
      for (const field of FORBIDDEN_FIELDS) {
        expect(res.body).not.toHaveProperty(field);
      }

      // Email must be decrypted plaintext
      expect(res.body.email).toBe(emailPlain);
    });

    it('returns 401 Unauthorized when Authorization header is absent', async () => {
      await request(app.getHttpServer())
        .get('/users/profile')
        .expect(401);
    });

    it('returns 401 Unauthorized when the JWT is signed with a wrong secret', async () => {
      const badToken = jwt.sign({ sub: '42', email: emailPlain }, 'wrong-secret');

      await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${badToken}`)
        .expect(401);
    });

    it('returns 401 Unauthorized when the JWT is malformed', async () => {
      await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', 'Bearer this.is.not.a.valid.jwt')
        .expect(401);
    });

    it('POST /users/profile returns 404 (method not supported)', async () => {
      await request(app.getHttpServer())
        .post('/users/profile')
        .expect(404);
    });
  });
});
