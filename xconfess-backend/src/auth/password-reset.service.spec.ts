import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordResetService } from './password-reset.service';
import { PasswordReset } from './entities/password-reset.entity';
import { User, UserRole } from '../user/entities/user.entity';
import { BadRequestException } from '@nestjs/common';
import { CryptoUtil } from '../common/crypto.util';

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let passwordResetRepository: Repository<PasswordReset>;
  let userRepository: Repository<User>;

  const mockUser = {
    id: 1,
    username: 'testuser',
    emailEncrypted: CryptoUtil.encrypt('test@example.com').encrypted,
    emailIv: CryptoUtil.encrypt('test@example.com').iv,
    emailTag: CryptoUtil.encrypt('test@example.com').tag,
    emailHash: CryptoUtil.hash('test@example.com'),
    password: 'hashedpassword',
    role: UserRole.USER,
    is_active: true,
    resetPasswordToken: null,
    resetPasswordExpires: null,
    notificationPreferences: {},
    privacySettings: {
      isDiscoverable: true,
      canReceiveReplies: true,
      showReactions: true,
      dataProcessingConsent: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any as User;

  const mockPasswordReset: PasswordReset = {
    id: 1,
    token: 'test-token-123',
    userId: 1,
    user: mockUser,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
    used: false,
    usedAt: null,
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    createdAt: new Date(),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        {
          provide: getRepositoryToken(PasswordReset),
          useValue: mockRepository,
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

    service = module.get<PasswordResetService>(PasswordResetService);
    passwordResetRepository = module.get<Repository<PasswordReset>>(
      getRepositoryToken(PasswordReset),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createResetToken', () => {
    it('should create and save a reset token', async () => {
      const savedPasswordReset = { ...mockPasswordReset, id: 1 };
      mockRepository.create.mockReturnValue(mockPasswordReset);
      mockRepository.save.mockResolvedValue(savedPasswordReset);

      const result = await service.createResetToken(
        1,
        '192.168.1.1',
        'Mozilla/5.0...',
      );

      expect(result).toMatch(/^[a-f0-9]{64}$/); // 32 bytes = 64 hex chars
      expect(mockRepository.create).toHaveBeenCalledWith({
        token: expect.any(String),
        userId: 1,
        expiresAt: expect.any(Date),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockPasswordReset);
    });

    it('should set expiration to 15 minutes from now', async () => {
      const savedPasswordReset = { ...mockPasswordReset, id: 1 };
      mockRepository.create.mockReturnValue(mockPasswordReset);
      mockRepository.save.mockResolvedValue(savedPasswordReset);

      const beforeCall = new Date();
      await service.createResetToken(1);
      const afterCall = new Date();

      const createCall = mockRepository.create.mock.calls[0][0];
      const expiresAt = createCall.expiresAt;

      // Should be approximately 15 minutes (900000ms) from now
      const expectedMinExpiry = new Date(beforeCall.getTime() + 14 * 60 * 1000);
      const expectedMaxExpiry = new Date(afterCall.getTime() + 16 * 60 * 1000);

      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(expectedMinExpiry.getTime());
      expect(expiresAt.getTime()).toBeLessThan(expectedMaxExpiry.getTime());
    });

    it('should throw error when save fails', async () => {
      mockRepository.create.mockReturnValue(mockPasswordReset);
      mockRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(service.createResetToken(1)).rejects.toThrow(
        'Failed to create reset token: Database error',
      );
    });
  });

  describe('findValidToken', () => {
    it('should return token when valid and not expired', async () => {
      const validToken = {
        ...mockPasswordReset,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      };
      mockRepository.findOne.mockResolvedValue(validToken);

      const result = await service.findValidToken('test-token-123');

      expect(result).toEqual(validToken);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          token: 'test-token-123',
          used: false,
        },
        relations: ['user'],
      });
    });

    it('should return null when token not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findValidToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null when token is expired', async () => {
      const expiredToken = {
        ...mockPasswordReset,
        expiresAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };
      mockRepository.findOne.mockResolvedValue(expiredToken);

      const result = await service.findValidToken('test-token-123');

      expect(result).toBeNull();
    });

    it('should throw error when database query fails', async () => {
      mockRepository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.findValidToken('test-token-123')).rejects.toThrow(
        'Error finding token: Database error',
      );
    });
  });

  describe('consumeValidToken', () => {
    it('returns invalid when token does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const res = await service.consumeValidToken('missing-token');
      expect(res.reset).toBeNull();
      expect(res.reason).toBe('invalid');
    });

    it('returns reused when token is already used', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockPasswordReset,
        used: true,
      });

      const res = await service.consumeValidToken('test-token-123');
      expect(res.reset).toBeNull();
      expect(res.reason).toBe('reused');
    });

    it('returns expired when token has expired', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockPasswordReset,
        expiresAt: new Date(Date.now() - 10 * 60 * 1000),
        used: false,
      });

      const res = await service.consumeValidToken('test-token-123');
      expect(res.reset).toBeNull();
      expect(res.reason).toBe('expired');
    });

    it('atomically consumes and returns valid', async () => {
      const existing = {
        ...mockPasswordReset,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
      };
      const consumed = {
        ...existing,
        used: true,
        usedAt: new Date(),
      };

      mockRepository.findOne
        .mockResolvedValueOnce(existing as any)
        .mockResolvedValueOnce(consumed as any);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const res = await service.consumeValidToken('test-token-123');
      expect(res.reset).toEqual(
        expect.objectContaining({
          ...consumed,
          usedAt: expect.any(Date),
        }),
      );
      expect(res.reason).toBe('valid');
      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'test-token-123' }),
        { used: true, usedAt: expect.any(Date) },
      );
    });

    it('returns reused when concurrent update affected 0 rows', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockPasswordReset,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
      });
      mockRepository.update.mockResolvedValue({ affected: 0 });

      const res = await service.consumeValidToken('test-token-123');
      expect(res.reset).toBeNull();
      expect(res.reason).toBe('reused');
    });
  });

  describe('markTokenAsUsed', () => {
    it('should mark token as used with current timestamp', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const beforeCall = new Date();
      await service.markTokenAsUsed(1);
      const afterCall = new Date();

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        used: true,
        usedAt: expect.any(Date),
      });

      const updateCall = mockRepository.update.mock.calls[0][1];
      const usedAt = updateCall.usedAt;
      expect(usedAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(usedAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    it('should throw error when update fails', async () => {
      mockRepository.update.mockRejectedValue(new Error('Database error'));

      await expect(service.markTokenAsUsed(1)).rejects.toThrow(
        'Failed to mark token as used: Database error',
      );
    });
  });

  describe('invalidateUserTokens', () => {
    it('should invalidate all unused tokens for a user', async () => {
      mockRepository.update.mockResolvedValue({ affected: 2 });

      await service.invalidateUserTokens(1);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { userId: 1, used: false },
        { used: true, usedAt: expect.any(Date) },
      );
    });

    it('should throw error when update fails', async () => {
      mockRepository.update.mockRejectedValue(new Error('Database error'));

      await expect(service.invalidateUserTokens(1)).rejects.toThrow(
        'Failed to invalidate tokens: Database error',
      );
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 3 });

      await service.cleanupExpiredTokens();

      // Accept LessThan operator in query
      expect(mockRepository.delete).toHaveBeenCalledWith({
        expiresAt: expect.objectContaining({
          _type: 'lessThan',
          _value: expect.any(Date),
        }),
      });
    });

    it('should not delete non-expired tokens', async () => {
      // Simulate no expired tokens
      mockRepository.delete.mockResolvedValue({ affected: 0 });
      await service.cleanupExpiredTokens();
      expect(mockRepository.delete).toHaveBeenCalledWith({
        expiresAt: expect.objectContaining({
          _type: 'lessThan',
          _value: expect.any(Date),
        }),
      });
    });

    it('should handle cleanup errors gracefully', async () => {
      mockRepository.delete.mockRejectedValue(new Error('Database error'));

      // Should not throw, just log the error
      await expect(service.cleanupExpiredTokens()).resolves.toBeUndefined();
    });
  });
});
