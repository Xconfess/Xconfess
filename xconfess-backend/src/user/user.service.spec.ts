import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { CryptoUtil } from '../common/crypto.util';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../common/errors/error-codes';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcryptjs';

describe('UserService', () => {
  let service: UserService;
  let repository: Repository<User>;
  let mockEmailService: any;

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    emailEncrypted: '',
    emailIv: '',
    emailTag: '',
    emailHash: CryptoUtil.hash('test@example.com'),
    password: 'hashedpassword',
    is_active: true,
    resetPasswordToken: null,
    resetPasswordExpires: null,
    privacySettings: {
      isDiscoverable: true,
      canReceiveReplies: true,
      showReactions: true,
      dataProcessingConsent: true,
    },
    isNotificationEnabled: jest.fn(),
    isDiscoverable: jest.fn(function (this: User) {
      return this.privacySettings?.isDiscoverable !== false;
    }),
    canReceiveReplies: jest.fn(function (this: User) {
      return this.privacySettings?.canReceiveReplies !== false;
    }),
    shouldShowReactions: jest.fn(function (this: User) {
      return this.privacySettings?.showReactions !== false;
    }),
    hasDataProcessingConsent: jest.fn(function (this: User) {
      return this.privacySettings?.dataProcessingConsent !== false;
    }),
    getEmail: jest.fn(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as User;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    mockEmailService = {
      sendWelcomeEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, fallback?: unknown) => fallback ?? '') },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));

    jest.clearAllMocks();
    mockRepository.findOne.mockResolvedValue(mockUser);
    mockRepository.save.mockResolvedValue(mockUser);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('should return user when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { emailHash: CryptoUtil.hash('test@example.com') },
      });
    });

    it('should return null when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should throw InternalServerErrorException on database error', async () => {
      mockRepository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.findByEmail('test@example.com')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findById', () => {
    it('should return user when found by ID', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findById(1);

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should return null when user not found by ID', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
    });

    it('should throw InternalServerErrorException on database error', async () => {
      mockRepository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.findById(1)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // findByResetToken was removed from service, so removing tests or skipping them

  describe('updatePassword', () => {
    it('should successfully update password and clear reset token fields', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(
        'new-hashed-password' as never,
      );
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.updatePassword(1, 'newpassword123');

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException on database error', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(
        'new-hashed-password' as never,
      );
      mockRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(service.updatePassword(1, 'newpassword123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('setResetPasswordToken', () => {
    it('should successfully set reset password token and expiration', async () => {
      const expiresAt = new Date();
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.setResetPasswordToken(1, 'reset-token', expiresAt);

      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException on database error', async () => {
      const expiresAt = new Date();
      mockRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(
        service.setResetPasswordToken(1, 'reset-token', expiresAt),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('create', () => {
    const validUserData = {
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
    };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedpassword' as never);
    });

    it('should encrypt and hash email on create', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockImplementation((userData) => userData);
      mockRepository.save.mockImplementation((userData) => userData);
      mockEmailService.sendWelcomeEmail.mockResolvedValue(undefined);

      const result = await service.create(
        validUserData.email,
        validUserData.password,
        validUserData.username,
      );

      // Check that encrypted fields are present and not equal to the plain email
      expect(result.emailEncrypted).toBeDefined();
      expect(result.emailIv).toBeDefined();
      expect(result.emailTag).toBeDefined();
      expect(result.emailEncrypted).not.toBe(validUserData.email);
      // Check that hash matches CryptoUtil.hash
      expect(result.emailHash).toBe(CryptoUtil.hash(validUserData.email));
      // Decrypt and check
      const decrypted = CryptoUtil.decrypt(
        result.emailEncrypted,
        result.emailIv,
        result.emailTag,
      );
      expect(decrypted).toBe(validUserData.email);
    });

    it('should successfully create a new user', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);
      mockEmailService.sendWelcomeEmail.mockResolvedValue(undefined);

      const result = await service.create(
        validUserData.email,
        validUserData.password,
        validUserData.username,
      );

      expect(result).toEqual(mockUser);
      expect(bcrypt.hash).toHaveBeenCalledWith(validUserData.password, 10);
      expect(mockRepository.create).toHaveBeenCalledWith({
        emailEncrypted: expect.any(String),
        emailIv: expect.any(String),
        emailTag: expect.any(String),
        emailHash: CryptoUtil.hash(validUserData.email),
        password: 'hashedpassword',
        username: validUserData.username,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockUser);
      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(
        validUserData.email,
        validUserData.username,
      );
    });

    it('should return a field-level conflict if email already exists', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.create(
          validUserData.email,
          validUserData.password,
          validUserData.username,
        ),
      ).rejects.toMatchObject({
        response: {
          message: 'An account with this email already exists.',
          code: ErrorCode.ALREADY_EXISTS,
          details: { field: 'email' },
        },
        status: 409,
      });
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should return a field-level conflict if username already exists', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser);

      await expect(
        service.create(
          validUserData.email,
          validUserData.password,
          validUserData.username,
        ),
      ).rejects.toMatchObject({
        response: {
          message: 'This username is already taken.',
          code: ErrorCode.ALREADY_EXISTS,
          details: { field: 'username' },
        },
        status: 409,
      });
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException on database error', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(
        service.create(
          validUserData.email,
          validUserData.password,
          validUserData.username,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException on password hashing error', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockRejectedValue(
        new Error('Hashing error') as never,
      );

      await expect(
        service.create(
          validUserData.email,
          validUserData.password,
          validUserData.username,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should continue registration even if welcome email fails', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);
      mockEmailService.sendWelcomeEmail.mockRejectedValue(
        new Error('Email error'),
      );

      const result = await service.create(
        validUserData.email,
        validUserData.password,
        validUserData.username,
      );

      expect(result).toEqual(mockUser);
      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalled();
    });

    it('should handle empty username', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({ ...mockUser, username: '' });
      mockRepository.save.mockResolvedValue({ ...mockUser, username: '' });

      const result = await service.create(
        validUserData.email,
        validUserData.password,
        '',
      );

      expect(result.username).toBe('');
      expect(result.emailEncrypted).toBeDefined();
      expect(result.emailIv).toBeDefined();
      expect(result.emailTag).toBeDefined();
      expect(result.emailHash).toBe(CryptoUtil.hash(validUserData.email));
      expect(mockRepository.create).toHaveBeenCalledWith({
        emailEncrypted: expect.any(String),
        emailIv: expect.any(String),
        emailTag: expect.any(String),
        emailHash: CryptoUtil.hash(validUserData.email),
        password: 'hashedpassword',
        username: '',
      });
    });

    it('should handle special characters in username', async () => {
      const specialUsername = 'test-user_123';
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        ...mockUser,
        username: specialUsername,
      });
      mockRepository.save.mockResolvedValue({
        ...mockUser,
        username: specialUsername,
      });

      const result = await service.create(
        validUserData.email,
        validUserData.password,
        specialUsername,
      );

      expect(result.username).toBe(specialUsername);
      expect(result.emailEncrypted).toBeDefined();
      expect(result.emailIv).toBeDefined();
      expect(result.emailTag).toBeDefined();
      expect(result.emailHash).toBe(CryptoUtil.hash(validUserData.email));
      expect(mockRepository.create).toHaveBeenCalledWith({
        emailEncrypted: expect.any(String),
        emailIv: expect.any(String),
        emailTag: expect.any(String),
        emailHash: CryptoUtil.hash(validUserData.email),
        password: 'hashedpassword',
        username: specialUsername,
      });
    });
  });

  describe('deactivateAccount', () => {
    it('should deactivate a user account', async () => {
      const userId = 1;
      const mockUser = {
        id: userId,
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        is_active: true,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.save.mockResolvedValue({ ...mockUser, is_active: false });

      const result = await service.deactivateAccount(userId);

      expect(result.is_active).toBe(false);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      const userId = 999;
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.deactivateAccount(userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reactivateAccount', () => {
    it('should reactivate a user account', async () => {
      const userId = 1;
      const mockUser = {
        id: userId,
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        is_active: false,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.save.mockResolvedValue({ ...mockUser, is_active: true });

      const result = await service.reactivateAccount(userId);

      expect(result.is_active).toBe(true);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      const userId = 999;
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.reactivateAccount(userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPrivacySettings', () => {
    it('should return user privacy settings', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getPrivacySettings(1);

      expect(result).toEqual({
        isDiscoverable: true,
        canReceiveReplies: true,
        showReactions: true,
        dataProcessingConsent: true,
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.getPrivacySettings(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updatePrivacySettings', () => {
    it('should update and return new privacy settings', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.save.mockResolvedValue({
        ...mockUser,
        privacySettings: {
          isDiscoverable: false,
          canReceiveReplies: false,
          showReactions: false,
          dataProcessingConsent: false,
        },
      });

      const dto = {
        isDiscoverable: false,
        canReceiveReplies: false,
        showReactions: false,
        dataProcessingConsent: false,
      };

      const result = await service.updatePrivacySettings(1, dto);

      expect(result).toEqual(dto);
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });
});
