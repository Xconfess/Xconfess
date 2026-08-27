import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { EmailService } from '../email/email.service';
import { PasswordResetService } from './password-reset.service';
import { LockoutService } from './lockout.service';
import { JwtService } from '@nestjs/jwt';
import { HttpStatus } from '@nestjs/common';
import { User, UserRole } from '../user/entities/user.entity';
import * as bcrypt from 'bcryptjs';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { CryptoUtil } from '../common/crypto.util';
import { UserResponse } from '../user/user.controller';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { getDefaultAdminStellarInvocationScopes } from '../stellar/stellar-invocation-policy';

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual('crypto');
  return {
    ...actualCrypto,
    randomBytes: jest.fn((size) => {
      const buf = Buffer.alloc(size, 0);
      return buf;
    }),
  };
});

describe('AuthService', () => {
  let service: AuthService;
  let userService: UserService;
  let emailService: EmailService;
  let passwordResetService: PasswordResetService;
  let jwtService: JwtService;

  const enc = CryptoUtil.encrypt('test@example.com');

  const mockUser: Partial<User> = {
    id: 1,
    username: 'testuser',
    emailEncrypted: enc.encrypted,
    emailIv: enc.iv,
    emailTag: enc.tag,
    emailHash: CryptoUtil.hash('test@example.com'),
    password: 'hashedpassword',
    role: UserRole.USER,
    is_active: true,
    notificationPreferences: {},
    privacySettings: {
      isDiscoverable: true,
      canReceiveReplies: true,
      showReactions: true,
      dataProcessingConsent: true,
    },
    isNotificationEnabled: jest.fn().mockReturnValue(true),
    isDiscoverable: jest.fn().mockReturnValue(true),
    canReceiveReplies: jest.fn().mockReturnValue(true),
    shouldShowReactions: jest.fn().mockReturnValue(true),
    hasDataProcessingConsent: jest.fn().mockReturnValue(true),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    setResetPasswordToken: jest.fn(),
    updatePassword: jest.fn(),
  };

  const mockEmailService = {
    sendPasswordResetEmail: jest.fn(),
  };

  const mockPasswordResetService = {
    createResetToken: jest.fn(),
    consumeValidToken: jest.fn(),
    invalidateUserTokens: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockAnonymousUserService = {
    getOrCreateForUserSession: jest.fn().mockResolvedValue({ id: 'anon-1' }),
  };

  const mockLockoutService = {
    getStatus: jest.fn().mockResolvedValue({
      isLocked: false,
      attemptsRemaining: 5,
      lockCount: 0,
    }),
    recordFailedAttempt: jest.fn(),
    clearLockout: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: PasswordResetService,
          useValue: mockPasswordResetService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: AnonymousUserService,
          useValue: mockAnonymousUserService,
        },
        {
          provide: LockoutService,
          useValue: mockLockoutService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    emailService = module.get<EmailService>(EmailService);
    passwordResetService =
      module.get<PasswordResetService>(PasswordResetService);
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forgotPassword', () => {
    it('should process forgot password request with email successfully', async () => {
      mockUserService.findByEmail.mockResolvedValue(mockUser);
      mockPasswordResetService.invalidateUserTokens.mockResolvedValue(undefined);
      mockPasswordResetService.createResetToken.mockResolvedValue('new-token-123');
      mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);

      const result = await service.forgotPassword(
        { email: 'test@example.com' },
        '192.168.1.1',
        'Mozilla/5.0...',
      );

      expect(mockUserService.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(result).toEqual({
        message: 'If the user exists, a password reset email has been sent.',
      });
    });

    it('should return success message for non-existent user (security)', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nonexistent@example.com',
      });

      expect(result).toEqual({
        message: 'If the user exists, a password reset email has been sent.',
      });
    });
  });

  describe('resetPassword', () => {
    it('should reset password with valid token', async () => {
      mockPasswordResetService.consumeValidToken.mockResolvedValue({
        reset: { userId: 1, id: 'token-id' },
      });
      mockUserService.updatePassword.mockResolvedValue(undefined);

      const result = await service.resetPassword('test-token-123', 'newPassword123');

      expect(result).toEqual({
        message: 'Password has been reset successfully',
      });
    });

    it('should throw AppException for invalid token', async () => {
      mockPasswordResetService.consumeValidToken.mockResolvedValue({
        reset: null,
        reason: 'invalid',
      });

      try {
        await service.resetPassword('invalid-token', 'newPassword123');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        const response = (error as AppException).getResponse() as any;
        expect(response.code).toBe(ErrorCode.AUTH_TOKEN_INVALID);
      }
    });
  });

  describe('validateUser', () => {
    it('should return user without password for valid credentials', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUserService.findByEmail.mockResolvedValue(mockUser);

      const result = await service.validateUser('test@example.com', 'password123');

      expect(result).toEqual(expect.objectContaining({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        role: UserRole.USER,
        is_active: true,
      }));
    });

    it('should throw AppException for deactivated account', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUserService.findByEmail.mockResolvedValue({ ...mockUser, is_active: false });

      try {
        await service.validateUser('test@example.com', 'password123');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        const response = (error as AppException).getResponse() as any;
        expect(response.code).toBe(ErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it('should return null for invalid credentials', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockUserService.findByEmail.mockResolvedValue(mockUser);

      const result = await service.validateUser('test@example.com', 'wrongpassword');

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should validate user with correct credentials', async () => {
      const mockUserResponse: UserResponse = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        role: UserRole.USER,
        is_active: true,
        notificationPreferences: {},
        privacy: {
          isDiscoverable: true,
          canReceiveReplies: true,
          showReactions: true,
          dataProcessingConsent: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(service, 'validateUser').mockResolvedValue(mockUserResponse);
      mockJwtService.sign.mockReturnValue('mock-jwt');

      const result = await service.login('test@example.com', 'password123');

      expect(result.access_token).toBe('mock-jwt');
      expect(result.user).toEqual(mockUserResponse);
    });

    it('should throw AppException for invalid credentials', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(null);

      try {
        await service.login('test@example.com', 'wrongpassword');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        const response = (error as AppException).getResponse() as any;
        expect(response.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
      }
    });

    it('issues granular Stellar invocation scopes for admin users', async () => {
      const mockAdminResponse: UserResponse = {
        id: 99,
        username: 'admin-user',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        is_active: true,
        notificationPreferences: {},
        privacy: {
          isDiscoverable: true,
          canReceiveReplies: true,
          showReactions: true,
          dataProcessingConsent: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(service, 'validateUser').mockResolvedValue(mockAdminResponse);
      mockJwtService.sign.mockReturnValue('mock-admin-jwt');

      await service.login('admin@example.com', 'password123');

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          role: UserRole.ADMIN,
          scopes: getDefaultAdminStellarInvocationScopes(),
        }),
      );
    });
  });
});
