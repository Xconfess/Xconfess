import { TippingController } from './tipping.controller';
import { TippingService, TipVerificationResult } from './tipping.service';
import { Tip, TipVerificationStatus } from './entities/tip.entity';
import { VerifyTipDto } from './dto/verify-tip.dto';

/**
 * Issue #1687 — verifies that the HTTP-facing response from
 * `POST /confessions/:id/tips/verify` never leaks internal-only Tip fields
 * (idempotencyKey, processingLock, lockedAt, lockedBy, retryCount,
 * lastChainStatus, lastCheckedAt, reconciliationMetadata) and always carries
 * a typed `state`.
 */
describe('TippingController — sanitized verify response (issue #1687)', () => {
  const confessionId = 'confession-1687';
  const txId = 'a'.repeat(64);
  const dto: VerifyTipDto = { txId };

  function makeFullTip(overrides: Partial<Tip> = {}): Tip {
    return {
      id: 'tip-1687',
      confessionId,
      txId,
      amount: 1.5,
      senderAddress: 'GXYZ...',
      idempotencyKey: 'super-secret-internal-hash',
      verificationStatus: TipVerificationStatus.VERIFIED,
      verifiedAt: new Date('2026-04-25T10:00:00.000Z'),
      rejectionReason: null,
      retryCount: 3,
      lastChainStatus: 'verified',
      lastCheckedAt: new Date(),
      reconciliationMetadata: {
        verifiedBy: 'user_request',
        requestId: 'internal-request-id',
      },
      processingLock: 'lock-token-abc',
      lockedAt: new Date(),
      lockedBy: 'verify',
      createdAt: new Date('2026-04-25T09:59:00.000Z'),
      ...overrides,
    } as Tip;
  }

  function makeController(result: TipVerificationResult) {
    const tippingService = {
      verifyAndRecordTip: jest.fn().mockResolvedValue(result),
      getTipStatusForConfession: jest.fn(),
    } as unknown as TippingService;
    return { controller: new TippingController(tippingService), tippingService };
  }

  it('strips internal-only fields from the response', async () => {
    const tip = makeFullTip();
    const { controller } = makeController({
      tip,
      isNew: true,
      isIdempotent: false,
      state: 'verified',
    });

    const response = await controller.verifyTip(confessionId, dto, { ip: '127.0.0.1' } as any);

    // Public fields present
    expect(response.tip).toMatchObject({
      id: 'tip-1687',
      confessionId,
      txId,
      amount: 1.5,
      senderAddress: 'GXYZ...',
      status: TipVerificationStatus.VERIFIED,
    });

    // Internal-only fields must never appear on the wire.
    const wireKeys = Object.keys(response.tip);
    expect(wireKeys).not.toContain('idempotencyKey');
    expect(wireKeys).not.toContain('processingLock');
    expect(wireKeys).not.toContain('lockedAt');
    expect(wireKeys).not.toContain('lockedBy');
    expect(wireKeys).not.toContain('retryCount');
    expect(wireKeys).not.toContain('lastChainStatus');
    expect(wireKeys).not.toContain('lastCheckedAt');
    expect(wireKeys).not.toContain('reconciliationMetadata');
    expect(wireKeys).not.toContain('rejectionReason');
  });

  it('surfaces the typed state and idempotency flags for a duplicate replay', async () => {
    const tip = makeFullTip({ verificationStatus: TipVerificationStatus.VERIFIED });
    const { controller } = makeController({
      tip,
      isNew: false,
      isIdempotent: true,
      state: 'duplicate',
    });

    const response = await controller.verifyTip(confessionId, dto, { ip: '127.0.0.1' } as any);

    expect(response.state).toBe('duplicate');
    expect(response.isNew).toBe(false);
    expect(response.isIdempotent).toBe(true);
    expect(response.success).toBe(true);
  });

  it('binds Idempotency-Key header and forwards caller context', async () => {
    const tip = makeFullTip();
    const { controller, tippingService } = makeController({
      tip,
      isNew: true,
      isIdempotent: false,
      state: 'verified',
    });

    await controller.verifyTip(confessionId, { txId }, { ip: '10.0.0.1' } as any, 'idem-1');

    expect((tippingService.verifyAndRecordTip as jest.Mock).mock.calls[0][1]).toMatchObject({
      txId,
      idempotencyKey: 'idem-1',
    });
    expect((tippingService.verifyAndRecordTip as jest.Mock).mock.calls[0][3]).toEqual({
      ip: '10.0.0.1',
    });
  });

  it('returns tip status via scoped service lookup (#2278)', async () => {
    const tippingService = {
      verifyAndRecordTip: jest.fn(),
      getTipStatusForConfession: jest.fn().mockResolvedValue({
        confessionId,
        txId,
        tipId: 'tip-1',
        lifecycleStatus: 'pending',
        verificationStatus: 'pending',
        amount: 1,
        verifiedAt: null,
        createdAt: new Date(),
        updatedAtHint: null,
      }),
    } as unknown as TippingService;
    const controller = new TippingController(tippingService);

    const result = await controller.getTipStatus(confessionId, txId);
    expect(tippingService.getTipStatusForConfession).toHaveBeenCalledWith(confessionId, txId);
    expect(result.lifecycleStatus).toBe('pending');
  });
});
