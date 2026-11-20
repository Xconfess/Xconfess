import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { RecoveryCodeService } from './recovery-code.service';
import { SessionRevocationService } from './session-revocation.service';
import { StepUpService } from './step-up.service';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

const LOGIN_FIELDS = ['access_token', 'anonymousUserId', 'user'];
const USER_FIELDS = [
  'id',
  'username',
  'role',
  'is_active',
  'email',
  'notificationPreferences',
  'privacy',
  'createdAt',
  'updatedAt',
];
const PRIVACY_FIELDS = [
  'isDiscoverable',
  'canReceiveReplies',
  'showReactions',
  'dataProcessingConsent',
];

describe('Auth identity contract', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let revocations: Map<number, number>;
  let totpEnabled: boolean;

  const user = {
    id: 42,
    username: 'alice_42',
    role: UserRole.USER,
    is_active: true,
    email: 'alice@example.com',
    notificationPreferences: { inAppNewMessage: true },
    privacy: {
      isDiscoverable: true,
      canReceiveReplies: true,
      showReactions: true,
      dataProcessingConsent: true,
    },
    createdAt: new Date('2026-04-25T10:00:00.000Z'),
    updatedAt: new Date('2026-04-25T10:00:00.000Z'),
  };

  beforeAll(async () => {
    jwtService = new JwtService({
      secret: 'contract-test-secret',
      signOptions: { expiresIn: '1d' },
    });
    revocations = new Map();
    totpEnabled = false;

    const authService = {
      userService: {
        findByEmail: jest.fn(async () => ({ id: user.id, totpEnabled })),
      },
      validateUser: jest.fn(async (email: string, password: string) =>
        email === user.email && password === 'correct-password' ? user : null,
      ),
      validateUserById: jest.fn(async () => user),
      login: jest.fn(async () => ({
        access_token: jwtService.sign({
          sub: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          scopes: [],
        }),
        anonymousUserId: 'anon-contract-1',
        user,
      })),
    };

    const sessionRevocationService = {
      revokeUserSessions: jest.fn(async (userId: number) => {
        revocations.set(userId, Date.now() + 1000);
      }),
      isSessionValid: jest.fn(async (userId: number, issuedAt: number) => {
        const revokedAt = revocations.get(userId);
        return !revokedAt || issuedAt * 1000 > revokedAt;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: StepUpService, useValue: {} },
        { provide: RecoveryCodeService, useValue: {} },
        { provide: SessionRevocationService, useValue: sessionRevocationService },
        { provide: ConfigService, useValue: { get: () => 'contract-test-secret' } },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn(async () => user),
          },
        },
        JwtStrategy,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    revocations.clear();
    totpEnabled = false;
  });

  afterAll(async () => {
    await app.close();
  });

  const login = async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'correct-password' })
      .expect(200);
    return response.body.access_token as string;
  };

  it('returns only documented login fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'correct-password' })
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual([...LOGIN_FIELDS].sort());
    expect(Object.keys(response.body.user).sort()).toEqual([...USER_FIELDS].sort());
    expect(Object.keys(response.body.user.privacy).sort()).toEqual(
      [...PRIVACY_FIELDS].sort(),
    );
    expect(typeof response.body.access_token).toBe('string');
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|resetToken|emailEncrypted|emailIv|emailTag|sourceKey/i,
    );
  });

  it('documents the two-factor login response fields', async () => {
    totpEnabled = true;
    try {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'correct-password' })
        .expect(200);

      expect(Object.keys(response.body).sort()).toEqual([
        'twoFactorRequired',
        'userId',
      ]);
      expect(response.body).toEqual({
        twoFactorRequired: true,
        userId: user.id,
      });
    } finally {
      totpEnabled = false;
    }
  });

  it('revokes credentials on logout', async () => {
    const token = await login();

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(logout.body).toEqual({ message: 'Logged out successfully' });

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(me.body.code).toBe('AUTH_SESSION_REVOKED');

    const session = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(session.body.code).toBe('AUTH_SESSION_REVOKED');
  });

  it('rejects expired logout requests with the documented envelope', async () => {
    const expiredToken = jwtService.sign(
      {
        sub: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        scopes: [],
      },
      { expiresIn: '-1s' },
    );

    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body.code).toBe('AUTH_SESSION_EXPIRED');
    expect(response.body).toMatchObject({
      schemaVersion: 1,
      status: 401,
      message: 'Authentication token has expired',
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  it('rejects malformed logout requests', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);

    expect(response.body.code).toBe('AUTH_TOKEN_INVALID');
    expect(response.body).not.toHaveProperty('stack');
  });

  it('rejects repeated logout requests and missing credentials', async () => {
    const token = await login();

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const repeated = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(repeated.body.code).toBe('AUTH_SESSION_REVOKED');

    const missing = await request(app.getHttpServer())
      .post('/auth/logout')
      .expect(401);
    expect(missing.body.code).toBe('AUTH_TOKEN_INVALID');
  });
});
