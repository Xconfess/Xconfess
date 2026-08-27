import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StepUpService } from './step-up.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { HttpStatus, HttpException } from '@nestjs/common';

describe('AuthController login', () => {
  let authController: AuthController;
  let mockAuthService: any;

  beforeEach(async () => {
    mockAuthService = {
      validateUser: jest.fn().mockResolvedValue({ id: 1, email: 'a@b.c', role: 'user' }),
      userService: {
        findByEmail: jest.fn().mockResolvedValue(null),
      },
      login: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: StepUpService, useValue: {} },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
  });

  it('returns the AuthService login payload for valid credentials', async () => {
    const successPayload = {
      access_token: 'jwt-token',
      user: { id: 1, username: 'u', email: 'a@b.c' },
      anonymousUserId: 'anon-1',
    };

    mockAuthService.login.mockResolvedValue(successPayload);

    const authResult = await authController.login({
      email: 'a@b.c',
      password: 'pass',
    } as any);

    expect(authResult).toEqual(successPayload);
  });

  it('propagates auth failure status and response', async () => {
    const appErr = new AppException(
      'Invalid credentials',
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED,
    );

    mockAuthService.login.mockRejectedValue(appErr);

    await expect(
      authController.login({ email: 'x', password: 'y' } as any),
    ).rejects.toThrow(HttpException);

    try {
      await authController.login({ email: 'x', password: 'y' } as any);
    } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(e.getResponse()).toHaveProperty('code');
    }
  });
});
