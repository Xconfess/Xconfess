import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StepUpService } from './step-up.service';
import { BadRequestException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  const mockStepUpService = {
    createProof: jest.fn(),
    assertValidProof: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: StepUpService,
          useValue: mockStepUpService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('forgotPassword', () => {
    const mockRequest = {
      ip: '192.168.1.1',
      headers: {
        'user-agent': 'Mozilla/5.0...',
        'x-forwarded-for': '203.0.113.1, 198.51.100.1',
      },
      connection: {
        remoteAddress: '10.0.0.1',
      },
    } as any;

    it('should successfully process forgot password request with email', async () => {
      const forgotPasswordDto = { email: 'test@example.com' };
      const expectedResponse = {
        message: 'If the user exists, a password reset email has been sent.',
      };

      mockAuthService.forgotPassword.mockResolvedValue(expectedResponse);

      const result = await controller.forgotPassword(
        forgotPasswordDto,
        mockRequest,
      );

      expect(authService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDto,
        '192.168.1.1',
        'Mozilla/5.0...',
      );
      expect(result).toEqual(expectedResponse);
    });

    it('should successfully process forgot password request with userId', async () => {
      const forgotPasswordDto = { userId: 1 };
      const expectedResponse = {
        message: 'If the user exists, a password reset email has been sent.',
      };

      mockAuthService.forgotPassword.mockResolvedValue(expectedResponse);

      const result = await controller.forgotPassword(
        forgotPasswordDto,
        mockRequest,
      );

      expect(authService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDto,
        '192.168.1.1',
        'Mozilla/5.0...',
      );
      expect(result).toEqual(expectedResponse);
    });

    it('should extract IP address from x-forwarded-for header when request.ip is not available', async () => {
      const requestWithoutIp = {
        ip: undefined,
        headers: {
          'user-agent': 'Mozilla/5.0...',
          'x-forwarded-for': '203.0.113.1, 198.51.100.1',
        },
        connection: {
          remoteAddress: '10.0.0.1',
        },
      } as any;

      const forgotPasswordDto = { email: 'test@example.com' };
      mockAuthService.forgotPassword.mockResolvedValue({ message: 'Success' });

      await controller.forgotPassword(forgotPasswordDto, requestWithoutIp);

      expect(authService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDto,
        '203.0.113.1',
        'Mozilla/5.0...',
      );
    });

    it('should use connection.remoteAddress as fallback for IP', async () => {
      const requestWithoutIpAndHeaders = {
        ip: undefined,
        headers: {
          'user-agent': 'Mozilla/5.0...',
        },
        connection: {
          remoteAddress: '10.0.0.1',
        },
      } as any;

      const forgotPasswordDto = { email: 'test@example.com' };
      mockAuthService.forgotPassword.mockResolvedValue({ message: 'Success' });

      await controller.forgotPassword(
        forgotPasswordDto,
        requestWithoutIpAndHeaders,
      );

      expect(authService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDto,
        '10.0.0.1',
        'Mozilla/5.0...',
      );
    });

    it('should throw BadRequestException when AuthService throws BadRequestException', async () => {
      const forgotPasswordDto = { email: 'test@example.com' };

      mockAuthService.forgotPassword.mockRejectedValue(
        new BadRequestException('Either email or userId must be provided'),
      );

      await expect(
        controller.forgotPassword(forgotPasswordDto, mockRequest),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.forgotPassword(forgotPasswordDto, mockRequest),
      ).rejects.toThrow('Either email or userId must be provided');
    });

    it('should return generic success message for other errors', async () => {
      const forgotPasswordDto = { email: 'test@example.com' };

      mockAuthService.forgotPassword.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const result = await controller.forgotPassword(
        forgotPasswordDto,
        mockRequest,
      );

      expect(result).toEqual({
        message: 'If the user exists, a password reset email has been sent.',
      });
    });
  });

  describe('resetPassword', () => {
    const resetPasswordDto = {
      token: 'valid-reset-token',
      newPassword: 'newpassword123',
    };

    it('should successfully reset password with valid token', async () => {
      const mockResponse = { message: 'Password has been reset successfully' };
      mockAuthService.resetPassword.mockResolvedValue(mockResponse);

      const result = await controller.resetPassword(resetPasswordDto);

      expect(result).toEqual(mockResponse);
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
        'valid-reset-token',
        'newpassword123',
      );
    });

    it('should throw BadRequestException for invalid token', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new BadRequestException('Invalid or expired reset token'),
      );

      await expect(controller.resetPassword(resetPasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for expired token', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new BadRequestException('Reset token has expired'),
      );

      await expect(controller.resetPassword(resetPasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle generic errors and wrap them in BadRequestException', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new Error('Database connection error'),
      );

      await expect(controller.resetPassword(resetPasswordDto)).rejects.toThrow(
        'Failed to reset password: Database connection error',
      );
    });
  });
});
