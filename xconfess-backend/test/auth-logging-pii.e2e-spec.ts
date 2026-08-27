import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../src/user/entities/user.entity';
import { UserRole } from '../src/user/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { Logger } from '@nestjs/common';

describe('Auth Logging PII Protection (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let testUser: User;
  let logger: Logger;
  let logMessages: string[] = [];

  beforeAll(async () => {
    // Capture log messages
    logger = new Logger('TestLogger');
    const originalLog = logger.log;

    logger.log = (message: string, context?: any) => {
      logMessages.push(message);
      if (context) {
        logMessages.push(`Context: ${JSON.stringify(context)}`);
      }
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepository = app.get(getRepositoryToken(User));
  });

  beforeEach(async () => {
    // Clean up test data and logs
    logMessages = [];
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Password Reset Flow Logging', () => {
    it('should not log PII in forgot password success', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({
          email: 'test@example.com',
        })
        .expect(200);

      expect(response.body.message).toContain(
        'password reset email has been sent',
      );

      // Check that no PII is logged
      const logContent = logMessages.join(' ');
      expect(logContent).not.toContain('test@example.com');
      expect(logContent).not.toContain('email:');

      // Should contain masked user ID
      expect(logContent).toContain('maskedUserId');
      expect(logContent).toContain('user_');
    });

    it('should not log PII in forgot password for user ID', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({
          userId: testUser.id,
        })
        .expect(200);

      expect(response.body.message).toContain(
        'password reset email has been sent',
      );

      // Check that no PII is logged
      const logContent = logMessages.join(' ');
      expect(logContent).not.toContain('test@example.com');
      expect(logContent).not.toContain(String(testUser.id));

      // Should contain masked user ID
      expect(logContent).toContain('maskedUserId');
      expect(logContent).toContain('user_');
    });

    it('should not log PII in password reset success', async () => {
      // First request password reset
      await request(app.getHttpServer()).post('/auth/forgot-password').send({
        email: 'test@example.com',
      });

      // Get the token from the email service (this would require mocking in real scenario)
      // For this test, we'll simulate getting the token and resetting password
      const token = 'test-token-123'; // In real scenario, this would come from email

      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: token,
          newPassword: 'newpassword123',
        })
        .expect(200);

      // Check that no PII is logged
      const logContent = logMessages.join(' ');
      expect(logContent).not.toContain('test@example.com');
      expect(logContent).not.toContain('email:');

      // Should contain masked user ID and token info
      expect(logContent).toContain('maskedUserId');
      expect(logContent).toContain('tokenId');
    });

    it('should not log PII in forgot password failure for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({
          email: 'nonexistent@example.com',
        })
        .expect(200); // Still returns 200 for security

      // Check that no PII is logged
      const logContent = logMessages.join(' ');
      expect(logContent).not.toContain('nonexistent@example.com');
      expect(logContent).not.toContain('email:');

      // Should contain warning about non-existent user
      expect(logContent).toContain('non-existent user');
    });
  });

  describe('Login Flow Logging', () => {
    it('should not log PII in successful login', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword',
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');

      // Login typically doesn't log PII, but let's verify
      const logContent = logMessages.join(' ');
      expect(logContent).not.toContain('test@example.com');
      expect(logContent).not.toContain('email:');
    });
  });

  describe('Masked User ID Format', () => {
    it('should use consistent masked ID format', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({
          email: 'test@example.com',
        })
        .expect(200);

      const logContent = logMessages.join(' ');

      // Should use user_ prefix with hash
      expect(logContent).toMatch(/user_[a-f0-9]{12}/);

      // Should be consistent length (user_ + 12 char hash)
      const maskedIdMatches = logContent.match(/user_[a-f0-9]{12}/g);
      expect(maskedIdMatches).toBeTruthy();

      if (maskedIdMatches) {
        maskedIdMatches.forEach((match) => {
          expect(match.length).toBe(18); // user_ + 12 chars
        });
      }
    });
  });

  describe('Error Logging', () => {
    it('should not log PII in error scenarios', async () => {
      // Trigger an error scenario
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({
          email: 'invalid-email', // This might cause validation errors
        })
        .expect(200); // Still returns 200 for security

      const logContent = logMessages.join(' ');

      // Should not contain the invalid email in logs
      expect(logContent).not.toContain('invalid-email');
      expect(logContent).not.toContain('email:');

      // Should contain error information without PII
      if (logContent.includes('error')) {
        expect(logContent).toContain('error');
        expect(logContent).not.toContain('invalid-email');
      }
    });
  });

  describe('Observable Data Points', () => {
    it('should log only safe, non-PII data points', async () => {
      await request(app.getHttpServer()).post('/auth/forgot-password').send({
        email: 'test@example.com',
      });

      const logContent = logMessages.join(' ');

      // Safe data points that should be present
      expect(logContent).toContain('maskedUserId');
      expect(logContent).toContain('ipAddress');
      expect(logContent).toContain('userAgent');

      // PII data points that should NOT be present
      expect(logContent).not.toContain('email:');
      expect(logContent).not.toContain('test@example.com');
      expect(logContent).not.toContain(String(testUser.id));
      expect(logContent).not.toContain('username:');
      expect(logContent).not.toContain('testuser');
    });
  });
});
