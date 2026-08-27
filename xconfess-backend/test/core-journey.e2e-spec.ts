import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserController } from '../src/user/user.controller';
import { AuthController } from '../src/auth/auth.controller';
import { ConfessionController } from '../src/confession/confession.controller';
import { ReactionController } from '../src/reaction/reaction.controller';
import { UserService } from '../src/user/user.service';
import { AuthService } from '../src/auth/auth.service';
import { ConfessionService } from '../src/confession/confession.service';
import { ReactionService } from '../src/reaction/reaction.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { CryptoUtil } from '../src/common/crypto.util';
import { UserRole } from '../src/user/entities/user.entity';

describe('Core Journey (e2e)', () => {
  let app: INestApplication;

  const usersByEmail = new Map<string, any>();
  const usersByUsername = new Map<string, any>();
  const confessions: any[] = [];
  const reactions: any[] = [];

  const authorAnonId = '11111111-1111-4111-8111-111111111111';
  const confessionId = '22222222-2222-4222-8222-222222222222';
  const reactionId = '33333333-3333-4333-8333-333333333333';

  const mockUserService = {
    findByEmail: jest.fn(
      async (email: string) => usersByEmail.get(email) ?? null,
    ),
    findByUsername: jest.fn(
      async (username: string) => usersByUsername.get(username) ?? null,
    ),
    create: jest.fn(
      async (email: string, _password: string, username: string) => {
        const encrypted = CryptoUtil.encrypt(email);
        const user = {
          id: 1,
          username,
          password: 'hashed',
          emailEncrypted: encrypted.encrypted,
          emailIv: encrypted.iv,
          emailTag: encrypted.tag,
          emailHash: CryptoUtil.hash(email),
          role: UserRole.USER,
          is_active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        usersByEmail.set(email, user);
        usersByUsername.set(username, user);
        return user;
      },
    ),
    findById: jest.fn(async (id: number) => {
      for (const user of usersByEmail.values()) {
        if (user.id === id) return user;
      }
      return null;
    }),
  };

  const mockAuthService = {
    login: jest.fn(async (email: string) => {
      const user = usersByEmail.get(email);
      if (!user) {
        throw new Error('Invalid credentials');
      }
      return {
        access_token: 'test-access-token',
        anonymousUserId: authorAnonId,
        user: {
          id: user.id,
          username: user.username,
          email,
          role: user.role,
          is_active: user.is_active,
        },
      };
    }),
    validateUserById: jest.fn(async (id: number) => {
      const user = await mockUserService.findById(id);
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        email: 'core-journey@example.com',
        role: user.role,
        is_active: user.is_active,
      };
    }),
  };

  const mockConfessionService = {
    create: jest.fn(async (dto: any) => {
      const confession = {
        id: confessionId,
        message: dto.message,
        gender: dto.gender ?? null,
        created_at: new Date().toISOString(),
      };
      confessions.push(confession);
      return confession;
    }),
    getConfessions: jest.fn(async () => ({
      data: confessions,
      meta: { total: confessions.length, page: 1, limit: 10, totalPages: 1 },
    })),
    search: jest.fn(),
    fullTextSearch: jest.fn(),
    getTrendingConfessions: jest.fn(async () => ({ data: [] })),
    getAllTags: jest.fn(async () => []),
    getConfessionsByTag: jest.fn(),
    getDeletedConfessions: jest.fn(),
    verifyStellarAnchor: jest.fn(),
    anchorConfession: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(),
    getConfessionByIdWithViewCount: jest.fn(),
  };

  const mockReactionService = {
    createReaction: jest.fn(async (dto: any) => {
      const reaction = {
        id: reactionId,
        emoji: dto.emoji,
        confession: { id: dto.confessionId },
        anonymousUser: { id: dto.anonymousUserId },
      };
      reactions.push(reaction);
      return reaction;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        UserController,
        AuthController,
        ConfessionController,
        ReactionController,
      ],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfessionService, useValue: mockConfessionService },
        { provide: ReactionService, useValue: mockReactionService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 1 };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    usersByEmail.clear();
    usersByUsername.clear();
    confessions.length = 0;
    reactions.length = 0;
  });

  it('covers register -> login -> guarded route -> create confession -> fetch feed -> react', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/users/register')
      .send({
        username: 'core-journey-user',
        email: 'core-journey@example.com',
        password: 'password123',
      })
      .expect(201);

    expect(registerResponse.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: 1,
          username: 'core-journey-user',
          email: 'core-journey@example.com',
          is_active: true,
        }),
      }),
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/api/users/login')
      .send({
        email: 'core-journey@example.com',
        password: 'password123',
      })
      .expect(200);

    expect(loginResponse.body).toEqual(
      expect.objectContaining({
        access_token: expect.any(String),
        anonymousUserId: authorAnonId,
        user: expect.objectContaining({
          id: 1,
          username: 'core-journey-user',
          email: 'core-journey@example.com',
        }),
      }),
    );

    const guardedResponse = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.access_token}`)
      .expect(200);

    expect(guardedResponse.body).toEqual(
      expect.objectContaining({
        id: 1,
        username: 'core-journey-user',
        email: 'core-journey@example.com',
      }),
    );

    const createConfessionResponse = await request(app.getHttpServer())
      .post('/api/confessions')
      .send({
        title: 'Core journey',
        body: 'This is my core journey confession',
        message: 'This is my core journey confession',
        gender: 'male',
      })
      .expect(201);

    expect(createConfessionResponse.body).toEqual(
      expect.objectContaining({
        id: confessionId,
        message: 'This is my core journey confession',
      }),
    );

    const feedResponse = await request(app.getHttpServer())
      .get('/api/confessions')
      .query({ page: 1, limit: 10, sort: 'newest' })
      .expect(200);

    expect(feedResponse.body).toEqual(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            id: confessionId,
            message: 'This is my core journey confession',
          }),
        ]),
        meta: expect.objectContaining({ total: 1 }),
      }),
    );

    const reactionResponse = await request(app.getHttpServer())
      .post('/api/reactions')
      .send({
        confessionId,
        anonymousUserId: authorAnonId,
        emoji: 'like',
      })
      .expect(201);

    expect(reactionResponse.body).toEqual(
      expect.objectContaining({
        id: reactionId,
        emoji: 'like',
        confession: expect.objectContaining({ id: confessionId }),
        anonymousUser: expect.objectContaining({ id: authorAnonId }),
      }),
    );
  });
});
