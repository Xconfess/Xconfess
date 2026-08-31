import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { PasswordResetService } from './password-reset.service';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { Repository } from 'typeorm';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { CryptoUtil } from '../common/crypto.util';
import { ConfigService } from '@nestjs/config';
import { LockoutService } from './lockout.service';
import { StepUpService } from './step-up.service';
import * as crypto from 'crypto';

const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

// Mock bcrypt module
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('Auth Integration Tests - Forgot Password Flow', () => {
  let authController: AuthController;
  let authService: AuthService;
  let userService: UserService;
  let passwordResetService: PasswordResetService;
  let emailService: EmailService;
  let userRepository: Repository<User>;
  let passwordResetRepository: Repository<PasswordReset>;

  const encrypted = CryptoUtil.encrypt('test@example.com');

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    emailEncrypted: encrypted.encrypted,
    emailIv: encrypted.iv,
    emailTag: encrypted.tag,
    emailHash: CryptoUtil.hash('test@example.com'),
    password: 'hashedpassword',
    resetPasswordToken: null,
    resetPasswordExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isAdmin: false,
    is_active: true,
    isDiscoverable: jest.fn().mockReturnValue(true),
    canReceiveReplies: jest.fn().mockReturnValue(true),
    shouldShowReactions: jest.fn().mockReturnValue(true),
    hasDataProcessingConsent: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        UserService,
        PasswordResetService,
        EmailService,
        JwtService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, fallback?: unknown) => fallback ?? '') },
        },
        {
          provide: AnonymousUserService,
          useValue: {
            getOrCreateForUserSession: jest
              .fn()
              .mockResolvedValue({ id: 'anon-1' }),
          },
        },
        {
          provide: LockoutService,
          useValue: {
            getStatus: jest.fn().mockResolvedValue({ isLocked: false }),
            recordFailedAttempt: jest
              .fn()
              .mockResolvedValue({ isLocked: false }),
            clearLockout: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: StepUpService,
          useValue: {
            issueStepUpToken: jest.fn(),
            verifyStepUpToken: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PasswordReset),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              delete: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 1 }),
            })),
          },
        },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    passwordResetService =
      module.get<PasswordResetService>(PasswordResetService);
    emailService = module.get<EmailService>(EmailService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    passwordResetRepository = module.get<Repository<PasswordReset>>(
      getRepositoryToken(PasswordReset),
    );

    // Setup bcrypt mocks
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  describe('Complete Forgot Password Flow', () => {
    it('should complete the full forgot password and reset flow', async () => {
      // Step 1: Mock user exists
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);

      // Step 2: Mock password reset token creation
      const mockPasswordReset = {
        id: 1,
        userId: 1,
        tokenHash: hashToken('reset-token-123'),
        expiresAt: new Date(Date.now() + 3600000),
        used: false,
        usedAt: null,
        createdAt: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      };

      jest
        .spyOn(passwordResetRepository, 'create')
        .mockReturnValue(mockPasswordReset as any);
      jest
        .spyOn(passwordResetRepository, 'save')
        .mockResolvedValue(mockPasswordReset as any);

      // Step 3: Mock email sending
      jest
        .spyOn(emailService, 'sendPasswordResetEmail')
        .mockResolvedValue(undefined);

      // Step 4: Execute forgot password request
      const mockRequest = {
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'test-agent',
        },
      };

      const forgotPasswordResult = await authController.forgotPassword(
        { email: 'test@example.com' },
        mockRequest as any,
      );

      expect(forgotPasswordResult).toEqual({
        message: 'If the user exists, a password reset email has been sent.',
      });

      // Verify that the email service was called
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String), // Accept any token since it's randomly generated
        'testuser',
      );

      // Capture the actual token that was generated
      const emailCallArgs = (emailService.sendPasswordResetEmail as jest.Mock)
        .mock.calls[0];
      const actualToken = emailCallArgs[1];

      // Step 5: Mock finding the reset token for password reset using the actual token
      const mockPasswordResetForLookup = {
        ...mockPasswordReset,
        tokenHash: hashToken(actualToken),
      };
      jest
        .spyOn(passwordResetRepository, 'findOne')
        .mockResolvedValue(mockPasswordResetForLookup as any);

      // Step 6: Mock updating the password
      jest
        .spyOn(userRepository, 'update')
        .mockResolvedValue({ affected: 1 } as any);

      // Step 7: Mock marking token as used
      jest
        .spyOn(passwordResetRepository, 'update')
        .mockResolvedValue({ affected: 1 } as any);

      // Step 8: Execute password reset with the actual token
      const resetPasswordResult = await authController.resetPassword({
        token: actualToken,
        newPassword: 'newPassword123',
      });

      expect(resetPasswordResult).toEqual({
        message: 'Password has been reset successfully',
      });

      // Verify that the password was updated
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'hashedPassword',
          resetPasswordToken: null,
          resetPasswordExpires: null,
        }),
      );

      // Verify that the token was marked as used, looked up by hash
      expect(passwordResetRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: hashToken(actualToken),
          used: false,
        }),
        {
          used: true,
          usedAt: expect.any(Date),
        },
      );
    });

    it('should handle invalid token during reset', async () => {
      // Mock token not found
      jest.spyOn(passwordResetRepository, 'findOne').mockResolvedValue(null);

      await expect(
        authController.resetPassword({
          token: 'invalid-token',
          newPassword: 'newPassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle expired token during reset', async () => {
      // Mock expired token
      const expiredToken = {
        id: 1,
        userId: 1,
        tokenHash: hashToken('expired-token-123'),
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        used: false,
        usedAt: null,
        createdAt: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      };

      jest
        .spyOn(passwordResetRepository, 'findOne')
        .mockResolvedValue(expiredToken as any);

      await expect(
        authController.resetPassword({
          token: 'expired-token-123',
          newPassword: 'newPassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle used token during reset', async () => {
      // Mock used token
      const usedToken = {
        id: 1,
        userId: 1,
        tokenHash: hashToken('used-token-123'),
        expiresAt: new Date(Date.now() + 3600000),
        used: true, // Already used
        usedAt: new Date(),
        createdAt: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      };

      jest.spyOn(passwordResetRepository, 'findOne').mockResolvedValue(null); // Return null for used token

      await expect(
        authController.resetPassword({
          token: 'used-token-123',
          newPassword: 'newPassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

describe('AuthService Integration', () => {
  let service: AuthService;
  let userService: UserService;
  let jwtService: JwtService;
  let emailService: EmailService;
  let passwordResetService: PasswordResetService;
  let userRepository: Repository<User>;

  const encrypted = CryptoUtil.encrypt('test@example.com');

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    emailEncrypted: encrypted.encrypted,
    emailIv: encrypted.iv,
    emailTag: encrypted.tag,
    emailHash: CryptoUtil.hash('test@example.com'),
    password: 'hashedpassword',
    resetPasswordToken: null,
    resetPasswordExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isAdmin: false,
    is_active: true,
    isDiscoverable: jest.fn().mockReturnValue(true),
    canReceiveReplies: jest.fn().mockReturnValue(true),
    shouldShowReactions: jest.fn().mockReturnValue(true),
    hasDataProcessingConsent: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        UserService,
        {
          provide: AnonymousUserService,
          useValue: {
            getOrCreateForUserSession: jest
              .fn()
              .mockResolvedValue({ id: 'anon-1' }),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, fallback?: unknown) => fallback ?? '') },
        },
        {
          provide: EmailService,
          useValue: {
            sendPasswordResetEmail: jest.fn(),
          },
        },
        {
          provide: PasswordResetService,
          useValue: {
            createResetToken: jest.fn(),
            validateResetToken: jest.fn(),
            invalidateUserTokens: jest.fn(),
          },
        },
        {
          provide: LockoutService,
          useValue: {
            getStatus: jest.fn().mockResolvedValue({ isLocked: false }),
            recordFailedAttempt: jest
              .fn()
              .mockResolvedValue({ isLocked: false }),
            clearLockout: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    jwtService = module.get<JwtService>(JwtService);
    emailService = module.get<EmailService>(EmailService);
    passwordResetService =
      module.get<PasswordResetService>(PasswordResetService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  describe('login', () => {
    it('should return access token and user data for valid credentials', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('test@example.com', 'password123');

      expect(result).toHaveProperty('access_token');
      expect(result.user).toMatchObject({
        id: mockUser.id,
        username: mockUser.username,
        email: 'test@example.com',
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        is_active: true,
        privacy: {
          isDiscoverable: true,
          canReceiveReplies: true,
          showReactions: true,
          dataProcessingConsent: true,
        },
      });
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('test@example.com', 'wrongpassword'),
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('forgotPassword', () => {
    it('should send password reset email for existing user', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest
        .spyOn(passwordResetService, 'createResetToken')
        .mockResolvedValue('reset-token');
      jest
        .spyOn(emailService, 'sendPasswordResetEmail')
        .mockResolvedValue(undefined);

      const result = await service.forgotPassword({
        email: 'test@example.com',
      });

      expect(result).toEqual({
        message: 'If the user exists, a password reset email has been sent.',
      });
      expect(passwordResetService.createResetToken).toHaveBeenCalledWith(
        mockUser.id,
        undefined,
        undefined,
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        'reset-token',
        mockUser.username,
      );
    });

    it('should handle non-existent user gracefully', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nonexistent@example.com',
      });

      expect(result).toEqual({
        message: 'If the user exists, a password reset email has been sent.',
      });
      expect(passwordResetService.createResetToken).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });
});
