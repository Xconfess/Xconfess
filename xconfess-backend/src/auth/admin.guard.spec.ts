import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { UserRole } from '../user/entities/user.entity';

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminGuard],
    }).compile();

    guard = module.get<AdminGuard>(AdminGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access for users with admin role', () => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            userId: 1,
            username: 'admin-user',
            role: UserRole.ADMIN,
          },
        }),
      }),
    } as ExecutionContext;

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should deny access for users with user role', () => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            userId: 2,
            username: 'regular-user',
            role: UserRole.USER,
          },
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      ForbiddenException,
    );
  });

  it('should deny access if user is not authenticated', () => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: null,
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      ForbiddenException,
    );
  });

  it('should deny access if user object is missing', () => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      ForbiddenException,
    );
  });
});
