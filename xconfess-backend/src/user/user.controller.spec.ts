import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AuthService } from '../auth/auth.service';
import { ConfessionService } from '../confession/confession.service';
import { User, UserRole } from './entities/user.entity';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { RegisterDto } from '../auth/dto/register.dto';
import { CryptoUtil } from '../common/crypto.util';

describe('UserController', () => {
  let controller: UserController;
  let userService: UserService;
  let authService: AuthService;

  const emailPlain = 'test@example.com';
  const emailEnc = CryptoUtil.encrypt(emailPlain);

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    emailEncrypted: emailEnc.encrypted,
    emailIv: emailEnc.iv,
    emailTag: emailEnc.tag,
    emailHash: CryptoUtil.hash(emailPlain),
    password: 'hashedpassword',
    resetPasswordToken: null,
    resetPasswordExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    is_active: true,
    is2faEnabled: false,
    role: UserRole.USER,
    notificationPreferences: {},
    privacySettings: {
      isDiscoverable: true,
      canReceiveReplies: true,
      showReactions: true,
      dataProcessingConsent: true,
    },
    isDiscoverable: jest.fn().mockReturnValue(true),
    canReceiveReplies: jest.fn().mockReturnValue(true),
    shouldShowReactions: jest.fn().mockReturnValue(true),
    hasDataProcessingConsent: jest.fn().mockReturnValue(true),
  } as unknown as User;

  const mockUserService = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    getPrivacySettings: jest.fn(),
    updatePrivacySettings: jest.fn(),
    saveUser: jest.fn(),
  };

  const mockAuthService = {
    login: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ConfessionService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    userService = module.get<UserService>(UserService);
    authService = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
    mockUserService.findById.mockResolvedValue(mockUser);
    mockUserService.findByEmail.mockResolvedValue(null);
    mockUserService.findByUsername.mockResolvedValue(null);
    mockAuthService.login.mockResolvedValue({
      access_token: 'token',
      user: mockUser,
      anonymousUserId: 'anon-id',
    });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return user profile without password', async () => {
      const result = await controller.getProfile(mockUser.id);
      expect(result).toEqual({
        id: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
        is_active: mockUser.is_active,
        email: emailPlain,
        notificationPreferences: mockUser.notificationPreferences,
        privacy: {
          isDiscoverable: true,
          canReceiveReplies: true,
          showReactions: true,
          dataProcessingConsent: true,
        },
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        is2faEnabled: false,
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Profile error');
      mockUserService.findById.mockRejectedValue(error);

      await expect(controller.getProfile(mockUser.id)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('register', () => {
    const validRegistrationData: RegisterDto = {
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
    };

    it('should create a new user successfully', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);
      mockUserService.create.mockResolvedValue(mockUser);

      const result = await controller.register(validRegistrationData);

      const expectedResult = {
        user: {
          id: mockUser.id,
          username: mockUser.username,
          role: mockUser.role,
          is_active: mockUser.is_active,
          email: emailPlain,
          notificationPreferences: mockUser.notificationPreferences,
          privacy: {
            isDiscoverable: true,
            canReceiveReplies: true,
            showReactions: true,
            dataProcessingConsent: true,
          },
          createdAt: mockUser.createdAt,
          updatedAt: mockUser.updatedAt,
          is2faEnabled: false,
        },
      };
      expect(result).toEqual(expectedResult);
      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        validRegistrationData.email,
      );
      expect(mockUserService.create).toHaveBeenCalledWith(
        validRegistrationData.email,
        validRegistrationData.password,
        validRegistrationData.username,
      );
    });

    it('should throw ConflictException if email already exists', async () => {
      mockUserService.findByEmail.mockResolvedValue(mockUser);

      await expect(controller.register(validRegistrationData)).rejects.toThrow(
        ConflictException,
      );
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid email format', async () => {
      const invalidEmailData = {
        ...validRegistrationData,
        email: 'invalid-email',
      };

      await expect(controller.register(invalidEmailData)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for short password', async () => {
      const shortPasswordData = {
        ...validRegistrationData,
        password: '123',
      };

      await expect(controller.register(shortPasswordData)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for empty username', async () => {
      const emptyUsernameData = {
        ...validRegistrationData,
        username: '',
      };

      await expect(controller.register(emptyUsernameData)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('should handle special characters in username', async () => {
      const specialUsernameData = {
        ...validRegistrationData,
        username: 'test-user_123',
      };
      mockUserService.findByEmail.mockResolvedValue(null);
      mockUserService.create.mockResolvedValue({
        ...mockUser,
        username: specialUsernameData.username,
      });

      const result = await controller.register(specialUsernameData);

      const expectedResult = {
        user: {
          id: mockUser.id,
          username: specialUsernameData.username,
          role: mockUser.role,
          is_active: mockUser.is_active,
          email: emailPlain,
          notificationPreferences: mockUser.notificationPreferences,
          privacy: {
            isDiscoverable: true,
            canReceiveReplies: true,
            showReactions: true,
            dataProcessingConsent: true,
          },
          createdAt: mockUser.createdAt,
          updatedAt: mockUser.updatedAt,
          is2faEnabled: false,
        },
      };
      expect(result).toEqual(expectedResult);
      expect(mockUserService.create).toHaveBeenCalledWith(
        specialUsernameData.email,
        specialUsernameData.password,
        specialUsernameData.username,
      );
    });

    it('should handle database errors gracefully', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);
      mockUserService.create.mockRejectedValue(new Error('Database error'));

      await expect(controller.register(validRegistrationData)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle service errors gracefully', async () => {
      mockUserService.findByEmail.mockRejectedValue(new Error('Service error'));

      await expect(controller.register(validRegistrationData)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('login', () => {
    it('should return access token and user data', async () => {
      const {
        password,
        emailEncrypted,
        emailIv,
        emailTag,
        emailHash,
        ...rest
      } = mockUser as any;
      const mockResponse = {
        access_token: 'mock-token',
        user: { ...rest, email: emailPlain },
      };
      mockAuthService.login.mockResolvedValue(mockResponse);

      const result = await controller.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual(mockResponse);
    });

    it('should throw UnauthorizedException if auth fails', async () => {
      mockAuthService.login.mockRejectedValue(new UnauthorizedException());
      await expect(
        controller.login({
          email: 'invalid@example.com',
          password: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
