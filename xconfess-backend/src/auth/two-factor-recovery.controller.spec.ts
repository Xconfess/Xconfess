import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { StepUpGuard } from './guards/step-up.guard';
import {
  AdminTwoFactorRecoveryController,
  TwoFactorRecoveryController,
} from './two-factor-recovery.controller';

const guardsOf = (target: object) =>
  (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as unknown[];

describe('Two-factor recovery controllers', () => {
  const recoveryCodes = {
    getStatus: jest.fn(),
    generateForUser: jest.fn(),
    revokeAll: jest.fn(),
  };
  const req = {
    ip: '203.0.113.7',
    headers: { 'user-agent': 'jest', 'x-request-id': 'req-1' },
  } as any;

  beforeEach(() => jest.resetAllMocks());

  describe('TwoFactorRecoveryController', () => {
    const controller = new TwoFactorRecoveryController(recoveryCodes as any);

    it('requires an authenticated user for every route', () => {
      expect(guardsOf(TwoFactorRecoveryController)).toContain(JwtAuthGuard);
    });

    it('requires a step-up proof to regenerate', () => {
      expect(guardsOf(TwoFactorRecoveryController.prototype.regenerate)).toContain(
        StepUpGuard,
      );
    });

    it('returns counts only from the status route', async () => {
      recoveryCodes.getStatus.mockResolvedValue({
        enabled: true,
        total: 10,
        remaining: 4,
        generatedAt: '2026-11-19T00:00:00.000Z',
      });

      await expect(controller.status(7)).resolves.toEqual({
        enabled: true,
        total: 10,
        remaining: 4,
        generatedAt: '2026-11-19T00:00:00.000Z',
      });
      expect(recoveryCodes.getStatus).toHaveBeenCalledWith(7);
    });

    it('regenerates for the caller and returns the new codes once', async () => {
      recoveryCodes.generateForUser.mockResolvedValue({
        codes: ['AAAAA-BBBBB'],
        batchId: 'b',
        revokedCount: 10,
      });

      await expect(controller.regenerate(7, req)).resolves.toEqual({
        recoveryCodes: ['AAAAA-BBBBB'],
        revokedCount: 10,
      });
      expect(recoveryCodes.generateForUser).toHaveBeenCalledWith(
        7,
        { type: 'user', id: 7 },
        'regenerate',
        { ipAddress: '203.0.113.7', userAgent: 'jest', requestId: 'req-1' },
      );
    });
  });

  describe('AdminTwoFactorRecoveryController', () => {
    const controller = new AdminTwoFactorRecoveryController(recoveryCodes as any);

    it('is restricted to admins and requires step-up', () => {
      expect(guardsOf(AdminTwoFactorRecoveryController)).toEqual(
        expect.arrayContaining([JwtAuthGuard, AdminGuard]),
      );
      expect(guardsOf(AdminTwoFactorRecoveryController.prototype.revoke)).toContain(
        StepUpGuard,
      );
    });

    it('revokes the target user codes as the acting admin', async () => {
      recoveryCodes.revokeAll.mockResolvedValue({ revokedCount: 6 });

      await expect(controller.revoke(42, 1, req)).resolves.toEqual({ revokedCount: 6 });
      expect(recoveryCodes.revokeAll).toHaveBeenCalledWith(
        42,
        { type: 'admin', id: 1 },
        'admin_revoked',
        expect.objectContaining({ ipAddress: '203.0.113.7' }),
      );
    });
  });
});
