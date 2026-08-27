import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../src/user/entities/user.entity';
import { UserRole } from '../src/user/entities/user.entity';
import * as bcrypt from 'bcrypt';

describe('JWT User Interface Standardization (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let testUser: User;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepository = app.get(getRepositoryToken(User));
  });

  beforeEach(async () => {
    // Clean up test data
    await userRepository.delete({});

    // Create test user
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    testUser = await userRepository.save({
      username: 'testuser',
      email: 'test@example.com',
      password: hashedPassword,
      role: UserRole.USER,
      is_active: true,
    });

    // Get access token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword',
      });

    accessToken = loginResponse.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('JWT Strategy User Shape', () => {
    it('should attach canonical RequestUser to request', async () => {
      // Test that the JWT strategy creates the correct user shape
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('username');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('role');
      expect(response.body.id).toBe(testUser.id);
      expect(response.body.username).toBe('testuser');
      expect(response.body.email).toBe('test@example.com');
      expect(response.body.role).toBe(UserRole.USER);
    });
  });

  describe('GetUser Decorator', () => {
    it('should extract user ID correctly with @GetUser("id")', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.id).toBe(testUser.id);
    });

    it('should extract entire user object with @GetUser()', async () => {
      // This tests a controller that uses @GetUser() without parameters
      // We'll test this through an endpoint that returns the user info
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('username');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('role');
    });
  });

  describe('Consistent User ID Extraction', () => {
    it('should work consistently across different guarded endpoints', async () => {
      // Test profile endpoint
      const profileResponse = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Test deactivation endpoint (also uses @GetUser('id'))
      const deactivateResponse = await request(app.getHttpServer())
        .post('/users/deactivate')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Both should return the same user ID
      expect(profileResponse.body.id).toBe(testUser.id);
      expect(deactivateResponse.body.id).toBe(testUser.id);
    });

    it('should reject requests without valid token', async () => {
      await request(app.getHttpServer()).get('/users/profile').expect(401);

      await request(app.getHttpServer()).post('/users/deactivate').expect(401);
    });

    it('should reject requests with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      await request(app.getHttpServer())
        .post('/users/deactivate')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('No Mixed ID Usage', () => {
    it('should not have userId vs id ambiguity', async () => {
      // This test ensures that the user object has a consistent shape
      // with 'id' as the canonical field, not 'userId'
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Should have 'id' field
      expect(response.body).toHaveProperty('id');

      // Should NOT have 'userId' field (no ambiguity)
      expect(response.body).not.toHaveProperty('userId');

      // Should NOT have 'sub' field (JWT payload shouldn't leak through)
      expect(response.body).not.toHaveProperty('sub');
    });
  });

  describe('Admin Endpoints User ID Consistency', () => {
    let adminToken: string;
    let adminUser: User;

    beforeEach(async () => {
      // Create admin user
      const hashedPassword = await bcrypt.hash('adminpassword', 10);
      adminUser = await userRepository.save({
        username: 'adminuser',
        email: 'admin@example.com',
        password: hashedPassword,
        role: UserRole.ADMIN,
        is_active: true,
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'adminpassword',
        });

      adminToken = loginResponse.body.access_token;
    });

    it('should extract admin user ID consistently in admin endpoints', async () => {
      // Test that admin endpoints also use the consistent user ID extraction
      // This would require creating a test endpoint or mocking existing ones
      // For now, we verify the JWT strategy works for admin users too
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.id).toBe(adminUser.id);
      expect(response.body.role).toBe(UserRole.ADMIN);
    });
  });
});
