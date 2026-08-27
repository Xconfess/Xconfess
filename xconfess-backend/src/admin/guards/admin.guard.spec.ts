import { AdminGuard } from '../../auth/admin.guard';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../user/entities/user.entity';

describe('AdminGuard', () => {
  it('throws if no user', () => {
    const guard = new AdminGuard();
    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => ({ user: null }),
      }),
    };
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws if not admin', () => {
    const guard = new AdminGuard();
    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.USER } }),
      }),
    };
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows admin', () => {
    const guard = new AdminGuard();
    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.ADMIN } }),
      }),
    };
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
