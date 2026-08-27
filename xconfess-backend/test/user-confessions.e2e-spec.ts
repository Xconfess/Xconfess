import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../src/user/entities/user.entity';
import { AnonymousConfession } from '../src/confession/entities/confession.entity';
import { AnonymousUser } from '../src/user/entities/anonymous-user.entity';
import { UserAnonymousUser } from '../src/user/entities/user-anonymous-link.entity';
import * as bcrypt from 'bcryptjs';
import { encryptConfession } from '../src/utils/confession-encryption';
import { ConfigService } from '@nestjs/config';
import { CryptoUtil } from '../src/common/crypto.util';

describe('User Confessions (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let confessionRepository: Repository<AnonymousConfession>;
  let anonymousUserRepository: Repository<AnonymousUser>;
  let userAnonRepo: Repository<UserAnonymousUser>;
  let configService: ConfigService;

  let testUser: User;
  let otherUser: User;
  let adminUser: User;
  let accessToken: string;
  let otherAccessToken: string;
  let adminAccessToken: string;
  let aesKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepository = app.get(getRepositoryToken(User));
    confessionRepository = app.get(getRepositoryToken(AnonymousConfession));
    anonymousUserRepository = app.get(getRepositoryToken(AnonymousUser));
    userAnonRepo = app.get(getRepositoryToken(UserAnonymousUser));
    configService = app.get(ConfigService);
    aesKey = configService.get<string>(
      'app.confessionAesKey',
      '12345678901234567890123456789012',
    );
  });

  beforeEach(async () => {
    // Clear data
    await userAnonRepo.delete({});
    await confessionRepository.delete({});
    await anonymousUserRepository.delete({});
    await userRepository.delete({});

    const hashedPassword = await bcrypt.hash('testpassword', 10);

    const createTestUser = async (
      email: string,
      username: string,
      role: UserRole,
    ) => {
      const normalizedEmail = email.trim().toLowerCase();
      const { encrypted, iv, tag } = CryptoUtil.encrypt(normalizedEmail);
      const emailHash = CryptoUtil.hash(normalizedEmail);
      return userRepository.save({
        username,
        emailEncrypted: encrypted,
        emailIv: iv,
        emailTag: tag,
        emailHash,
        password: hashedPassword,
        role,
        is_active: true,
      });
    };

    testUser = await createTestUser(
      'test@example.com',
      'testuser',
      UserRole.USER,
    );
    otherUser = await createTestUser(
      'other@example.com',
      'otheruser',
      UserRole.USER,
    );
    adminUser = await createTestUser(
      'admin@example.com',
      'adminuser',
      UserRole.ADMIN,
    );

    // Get tokens
    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'testpassword' });
      return res.body.access_token;
    };

    accessToken = await login('test@example.com');
    otherAccessToken = await login('other@example.com');
    adminAccessToken = await login('admin@example.com');

    // Create an anonymous identity for testUser
    const anon = await anonymousUserRepository.save(
      anonymousUserRepository.create(),
    );
    await userAnonRepo.save(
      userAnonRepo.create({
        userId: testUser.id,
        anonymousUserId: anon.id,
      }),
    );

    // Create confessions for testUser
    for (let i = 1; i <= 5; i++) {
      await confessionRepository.save(
        confessionRepository.create({
          message: encryptConfession(`Confession ${i}`, aesKey),
          anonymousUser: anon,
          moderationStatus: i % 2 === 0 ? 'approved' : 'pending',
          created_at: new Date(Date.now() - i * 1000),
        }),
      );
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('should fetch own confessions with pagination', async () => {
    const response = await request(app.getHttpServer())
      .get(`/users/${testUser.id}/confessions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ limit: 2 })
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.hasMore).toBe(true);
    expect(response.body.data[0].message).toBe('Confession 1');
    expect(response.body.data[1].message).toBe('Confession 2');
  });

  it('should filter own confessions by status', async () => {
    const response = await request(app.getHttpServer())
      .get(`/users/${testUser.id}/confessions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ status: 'approved' })
      .expect(200);

    expect(
      response.body.data.every((i: any) => i.moderationStatus === 'approved'),
    ).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('should prevent user from fetching others confessions', async () => {
    await request(app.getHttpServer())
      .get(`/users/${testUser.id}/confessions`)
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .expect(403);
  });

  it('should allow admin to fetch any user confessions', async () => {
    const response = await request(app.getHttpServer())
      .get(`/users/${testUser.id}/confessions`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('should return empty list for user with no confessions', async () => {
    const response = await request(app.getHttpServer())
      .get(`/users/${otherUser.id}/confessions`)
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .expect(200);

    expect(response.body.data).toHaveLength(0);
    expect(response.body.hasMore).toBe(false);
  });
});
