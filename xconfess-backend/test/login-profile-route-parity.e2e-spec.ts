import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/user/entities/user.entity';

/**
 * Parity tests for the intentionally duplicated auth/profile route surfaces.
 *
 * The backend deliberately keeps two parallel login routes:
 *   POST /api/users/login
 *   POST /api/auth/login
 *
 * And two parallel profile routes:
 *   GET  /api/users/profile
 *   GET  /api/auth/me
 *
 * These tests fail if the two surfaces drift from each other so that a
 * future contributor cannot silently break one path without the other.
 */
describe('Login and Profile Route Parity (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;

  const TEST_EMAIL = 'parity-test@example.com';
  const TEST_PASSWORD = 'parityTestPass123';
  const TEST_USERNAME = 'parityuser';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepository = app.get(getRepositoryToken(User));
  });

  beforeEach(async () => {
    await userRepository.delete({ email: TEST_EMAIL });

    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
    await userRepository.save({
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      password: hashedPassword,
      is_active: true,
    });
  });

  afterAll(async () => {
    await userRepository.delete({ email: TEST_EMAIL });
    await app.close();
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function loginViaUsersRoute() {
    return request(app.getHttpServer())
      .post('/api/users/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
  }

  async function loginViaAuthRoute() {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
  }

  async function getProfileViaUsersRoute(token: string) {
    return request(app.getHttpServer())
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);
  }

  async function getProfileViaAuthRoute(token: string) {
    return request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
  }

  // ── Login route parity ────────────────────────────────────────────────────

  describe('Login route parity — /api/users/login vs /api/auth/login', () => {
    it('both routes return HTTP 200 for valid credentials', async () => {
      const [usersRes, authRes] = await Promise.all([
        loginViaUsersRoute(),
        loginViaAuthRoute(),
      ]);

      expect(usersRes.status).toBe(200);
      expect(authRes.status).toBe(200);
    });

    it('both routes return an access_token field', async () => {
      const [usersRes, authRes] = await Promise.all([
        loginViaUsersRoute(),
        loginViaAuthRoute(),
      ]);

      expect(usersRes.body).toHaveProperty('access_token');
      expect(authRes.body).toHaveProperty('access_token');
      expect(typeof usersRes.body.access_token).toBe('string');
      expect(typeof authRes.body.access_token).toBe('string');
    });

    it('both routes embed the same user object shape in the response', async () => {
      const [usersRes, authRes] = await Promise.all([
        loginViaUsersRoute(),
        loginViaAuthRoute(),
      ]);

      const usersUser = usersRes.body.user;
      const authUser = authRes.body.user;

      // Both must expose the same top-level fields.
      const requiredFields = ['id', 'username', 'email', 'is_active'];
      for (const field of requiredFields) {
        expect(usersUser).toHaveProperty(
          field,
          `users/login response is missing field: ${field}`,
        );
        expect(authUser).toHaveProperty(
          field,
          `auth/login response is missing field: ${field}`,
        );
      }

      // Values for the same user must match across both routes.
      expect(usersUser.email).toBe(authUser.email);
      expect(usersUser.username).toBe(authUser.username);
      expect(usersUser.is_active).toBe(authUser.is_active);
    });

    it('neither route leaks the password hash in the login response', async () => {
      const [usersRes, authRes] = await Promise.all([
        loginViaUsersRoute(),
        loginViaAuthRoute(),
      ]);

      expect(usersRes.body.user).not.toHaveProperty('password');
      expect(authRes.body.user).not.toHaveProperty('password');
    });

    it('both routes return HTTP 401 for wrong password', async () => {
      const [usersRes, authRes] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/users/login')
          .send({ email: TEST_EMAIL, password: 'wrong' }),
        request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: TEST_EMAIL, password: 'wrong' }),
      ]);

      expect(usersRes.status).toBe(401);
      expect(authRes.status).toBe(401);
    });

    it('both routes return HTTP 401 for non-existent user', async () => {
      const [usersRes, authRes] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/users/login')
          .send({ email: 'nobody@example.com', password: 'any' }),
        request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'nobody@example.com', password: 'any' }),
      ]);

      expect(usersRes.status).toBe(401);
      expect(authRes.status).toBe(401);
    });

    it('both routes return HTTP 401 for an inactive user', async () => {
      await userRepository.update({ email: TEST_EMAIL }, { is_active: false });

      const [usersRes, authRes] = await Promise.all([
        loginViaUsersRoute(),
        loginViaAuthRoute(),
      ]);

      expect(usersRes.status).toBe(401);
      expect(authRes.status).toBe(401);
    });

    it('tokens from both routes are interchangeable across all authenticated endpoints', async () => {
      const [usersRes, authRes] = await Promise.all([
        loginViaUsersRoute(),
        loginViaAuthRoute(),
      ]);

      const tokenFromUsers = usersRes.body.access_token;
      const tokenFromAuth = authRes.body.access_token;

      // Token from /users/login must work on /auth/me.
      const profileWithUsersToken = await getProfileViaAuthRoute(tokenFromUsers);
      expect(profileWithUsersToken.status).toBe(200);

      // Token from /auth/login must work on /users/profile.
      const profileWithAuthToken = await getProfileViaUsersRoute(tokenFromAuth);
      expect(profileWithAuthToken.status).toBe(200);
    });
  });

  // ── Profile route parity ──────────────────────────────────────────────────

  describe('Profile route parity — /api/users/profile vs /api/auth/me', () => {
    let accessToken: string;

    beforeEach(async () => {
      const loginRes = await loginViaAuthRoute();
      accessToken = loginRes.body.access_token;
    });

    it('both routes return HTTP 200 with a valid token', async () => {
      const [usersRes, authRes] = await Promise.all([
        getProfileViaUsersRoute(accessToken),
        getProfileViaAuthRoute(accessToken),
      ]);

      expect(usersRes.status).toBe(200);
      expect(authRes.status).toBe(200);
    });

    it('both routes return the same user fields', async () => {
      const [usersRes, authRes] = await Promise.all([
        getProfileViaUsersRoute(accessToken),
        getProfileViaAuthRoute(accessToken),
      ]);

      const requiredFields = ['id', 'username', 'email', 'is_active'];
      for (const field of requiredFields) {
        expect(usersRes.body).toHaveProperty(
          field,
          `/users/profile is missing field: ${field}`,
        );
        expect(authRes.body).toHaveProperty(
          field,
          `/auth/me is missing field: ${field}`,
        );
      }
    });

    it('both routes return the same field values for the authenticated user', async () => {
      const [usersRes, authRes] = await Promise.all([
        getProfileViaUsersRoute(accessToken),
        getProfileViaAuthRoute(accessToken),
      ]);

      expect(usersRes.body.id).toBe(authRes.body.id);
      expect(usersRes.body.email).toBe(authRes.body.email);
      expect(usersRes.body.username).toBe(authRes.body.username);
      expect(usersRes.body.is_active).toBe(authRes.body.is_active);
    });

    it('neither route exposes the password hash in the profile response', async () => {
      const [usersRes, authRes] = await Promise.all([
        getProfileViaUsersRoute(accessToken),
        getProfileViaAuthRoute(accessToken),
      ]);

      expect(usersRes.body).not.toHaveProperty('password');
      expect(authRes.body).not.toHaveProperty('password');
    });

    it('both routes return HTTP 401 without a token', async () => {
      const [usersRes, authRes] = await Promise.all([
        request(app.getHttpServer()).get('/api/users/profile'),
        request(app.getHttpServer()).get('/api/auth/me'),
      ]);

      expect(usersRes.status).toBe(401);
      expect(authRes.status).toBe(401);
    });

    it('both routes return HTTP 401 with an invalid token', async () => {
      const [usersRes, authRes] = await Promise.all([
        request(app.getHttpServer())
          .get('/api/users/profile')
          .set('Authorization', 'Bearer invalid.token.here'),
        request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', 'Bearer invalid.token.here'),
      ]);

      expect(usersRes.status).toBe(401);
      expect(authRes.status).toBe(401);
    });

    it('profile data from both routes is consistent with login response user data', async () => {
      const loginRes = await loginViaAuthRoute();
      const loginUser = loginRes.body.user;
      const token = loginRes.body.access_token;

      const [usersProfileRes, authProfileRes] = await Promise.all([
        getProfileViaUsersRoute(token),
        getProfileViaAuthRoute(token),
      ]);

      // Login user object and both profile endpoints must agree on identity.
      expect(loginUser.id).toBe(usersProfileRes.body.id);
      expect(loginUser.id).toBe(authProfileRes.body.id);
      expect(loginUser.email).toBe(usersProfileRes.body.email);
      expect(loginUser.email).toBe(authProfileRes.body.email);
    });

    it('both routes return all canonical UserResponse fields with equal values', async () => {
      const [usersRes, authRes] = await Promise.all([
        getProfileViaUsersRoute(accessToken),
        getProfileViaAuthRoute(accessToken),
      ]);

      // Every top-level field of the canonical schema must be present on both routes.
      const topLevelFields = [
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
      for (const field of topLevelFields) {
        expect(usersRes.body).toHaveProperty(field);
        expect(authRes.body).toHaveProperty(field);
      }

      // The privacy sub-object must contain every expected flag.
      const privacyFields = [
        'isDiscoverable',
        'canReceiveReplies',
        'showReactions',
        'dataProcessingConsent',
      ];
      for (const field of privacyFields) {
        expect(usersRes.body.privacy).toHaveProperty(field);
        expect(authRes.body.privacy).toHaveProperty(field);
      }

      // Values must be identical across both routes for the same caller.
      for (const field of topLevelFields) {
        expect(usersRes.body[field]).toEqual(authRes.body[field]);
      }
    });

    it('both routes return HTTP 401 when the user is deactivated after the token is issued', async () => {
      // Token obtained in beforeEach while user was active; deactivate now.
      await userRepository.update({ username: TEST_USERNAME }, { is_active: false });

      const [usersRes, authRes] = await Promise.all([
        getProfileViaUsersRoute(accessToken),
        getProfileViaAuthRoute(accessToken),
      ]);

      expect(usersRes.status).toBe(401);
      expect(authRes.status).toBe(401);
    });

    it('both routes return HTTP 401 when the user record is deleted after the token is issued', async () => {
      // Token obtained in beforeEach while user existed; delete now.
      await userRepository.delete({ username: TEST_USERNAME });

      const [usersRes, authRes] = await Promise.all([
        getProfileViaUsersRoute(accessToken),
        getProfileViaAuthRoute(accessToken),
      ]);

      expect(usersRes.status).toBe(401);
      expect(authRes.status).toBe(401);
    });

    it('neither route exposes internal fields (reset tokens, raw ciphertext)', async () => {
      const [usersRes, authRes] = await Promise.all([
        getProfileViaUsersRoute(accessToken),
        getProfileViaAuthRoute(accessToken),
      ]);

      const internalFields = [
        'password',
        'resetPasswordToken',
        'resetPasswordExpires',
        'emailEncrypted',
        'emailIv',
        'emailTag',
        'emailHash',
      ];
      for (const field of internalFields) {
        expect(usersRes.body).not.toHaveProperty(field);
        expect(authRes.body).not.toHaveProperty(field);
      }
    });
  });
});
