import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy (#2235 — existing-session deactivation)', () => {
  const configService = { get: () => 'test-secret' } as any;

  function makeStrategy(user: any) {
    const userService = { findById: jest.fn().mockResolvedValue(user) } as any;
    return new JwtStrategy(configService, userService);
  }

  it('rejects an existing session whose account was deactivated after login', async () => {
    const strategy = makeStrategy({ id: 1, role: 'USER', is_active: false });
    await expect(
      strategy.validate({ sub: 1, username: 'u', email: 'e@example.com' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts an active account', async () => {
    const strategy = makeStrategy({ id: 1, role: 'USER', is_active: true });
    const result = await strategy.validate({ sub: 1, username: 'u', email: 'e@example.com' } as any);
    expect(result.id).toBe(1);
  });
});
