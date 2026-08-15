import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { StepUpGuard } from './step-up.guard';
import { AppException } from '../common/errors/app-exception';

describe('StepUpGuard', () => {
  let guard: StepUpGuard;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = { verify: jest.fn() } as unknown as JwtService;
    guard = new StepUpGuard(jwtService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access with a valid, matching step-up token', () => {
    (jwtService.verify as jest.Mock).mockReturnValue({
      sub: 1,
      stepUp: true,
    });

    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-step-up-token': 'valid-token' },
          user: { userId: 1 },
        }),
      }),
    } as ExecutionContext;

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should deny access when no step-up token is provided', () => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          user: { userId: 1 },
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      AppException,
    );
  });

  it('should deny access when the step-up token is expired or invalid', () => {
    (jwtService.verify as jest.Mock).mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-step-up-token': 'expired-token' },
          user: { userId: 1 },
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      AppException,
    );
  });

  it('should deny access if token belongs to a different user', () => {
    (jwtService.verify as jest.Mock).mockReturnValue({
      sub: 999,
      stepUp: true,
    });

    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-step-up-token': 'valid-token' },
          user: { userId: 1 },
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      AppException,
    );
  });
});
