import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { PasswordResetService } from './password-reset.service';
import { PasswordReset } from './entities/password-reset.entity';
import { User, UserRole } from '../user/entities/user.entity';
import { CryptoUtil } from '../common/crypto.util';

const RAW_TOKEN = 'test-token-123';
const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

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
    tokenHash: hashToken(RAW_TOKEN),
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
    // Default so createResetToken's internal invalidateUserTokens() call
    // (and any other unmocked update()) resolves instead of returning undefined.
    mockRepository.update.mockResolvedValue({ affected: 0 });
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
        tokenHash: expect.any(String),
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

    // ── Hardening regressions (#1436) ───────────────────────────────────────

    it('never persists the raw token — only its SHA-256 hash is stored', async () => {
      const savedPasswordReset = { ...mockPasswordReset, id: 1 };
      mockRepository.create.mockReturnValue(mockPasswordReset);
      mockRepository.save.mockResolvedValue(savedPasswordReset);

      const rawToken = await service.createResetToken(1);

      const createArg = mockRepository.create.mock.calls[0][0];
      expect(createArg.tokenHash).toBe(hashToken(rawToken));
      expect(createArg.tokenHash).not.toBe(rawToken);
      expect(createArg).not.toHaveProperty('token');

      // Nothing passed to save() should carry the plaintext token either.
      const savedArg = mockRepository.save.mock.calls[0][0];
      expect(JSON.stringify(savedArg)).not.toContain(rawToken);
    });

    it('invalidates prior outstanding tokens for the user before creating a new one', async () => {
      const savedPasswordReset = { ...mockPasswordReset, id: 2 };
      mockRepository.create.mockReturnValue(mockPasswordReset);
      mockRepository.save.mockResolvedValue(savedPasswordReset);

      await service.createResetToken(1);

      // The invalidation UPDATE must run, and must happen before the new
      // token is persisted so there is never a window with two live tokens.
      expect(mockRepository.update).toHaveBeenCalledWith(
        { userId: 1, used: false },
        { used: true, usedAt: expect.any(Date) },
      );
      const updateOrder = mockRepository.update.mock.invocationCallOrder[0];
      const saveOrder = mockRepository.save.mock.invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(saveOrder);
    });
  });

  describe('findValidToken', () => {
    it('should return token when valid and not expired', async () => {
      const validToken = {
        ...mockPasswordReset,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      };
      mockRepository.findOne.mockResolvedValue(validToken);

      const result = await service.findValidToken(RAW_TOKEN);

      expect(result).toEqual(validToken);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          tokenHash: hashToken(RAW_TOKEN),
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

      const result = await service.findValidToken(RAW_TOKEN);

      expect(result).toBeNull();
    });

    it('should throw error when database query fails', async () => {
      mockRepository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.findValidToken(RAW_TOKEN)).rejects.toThrow(
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

      const res = await service.consumeValidToken(RAW_TOKEN);
      expect(res.reset).toBeNull();
      expect(res.reason).toBe('reused');
    });

    it('returns expired when token has expired', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockPasswordReset,
        expiresAt: new Date(Date.now() - 10 * 60 * 1000),
        used: false,
      });

      const res = await service.consumeValidToken(RAW_TOKEN);
      expect(res.reset).toBeNull();
      expect(res.reason).toBe('expired');
    });

    it('looks up the token by its hash, never by the raw value', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await service.consumeValidToken(RAW_TOKEN);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { tokenHash: hashToken(RAW_TOKEN) },
        relations: ['user'],
      });
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

      const res = await service.consumeValidToken(RAW_TOKEN);
      expect(res.reset).toEqual(
        expect.objectContaining({
          ...consumed,
          usedAt: expect.any(Date),
        }),
      );
      expect(res.reason).toBe('valid');
      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: hashToken(RAW_TOKEN) }),
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

      const res = await service.consumeValidToken(RAW_TOKEN);
      expect(res.reset).toBeNull();
      expect(res.reason).toBe('reused');
    });

    // ── Hardening regression (#1436): consumed token cannot be reused ──────

    it('rejects a second consume attempt against the same token', async () => {
      const unused = {
        ...mockPasswordReset,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
      };
      const consumed = { ...unused, used: true, usedAt: new Date() };

      // First attempt: token is fetched unused, atomic update succeeds.
      mockRepository.findOne
        .mockResolvedValueOnce(unused as any)
        .mockResolvedValueOnce(consumed as any);
      mockRepository.update.mockResolvedValueOnce({ affected: 1 });

      const first = await service.consumeValidToken(RAW_TOKEN);
      expect(first.reason).toBe('valid');

      // Second attempt: the record now has used=true, so the pre-check
      // short-circuits before any update is attempted.
      mockRepository.findOne.mockResolvedValueOnce(consumed as any);

      const second = await service.consumeValidToken(RAW_TOKEN);
      expect(second.reset).toBeNull();
      expect(second.reason).toBe('reused');
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
