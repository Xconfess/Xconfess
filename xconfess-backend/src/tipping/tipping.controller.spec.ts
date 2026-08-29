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
    } as unknown as TippingService;
    return new TippingController(tippingService);
  }

  it('strips internal-only fields from the response', async () => {
    const tip = makeFullTip();
    const controller = makeController({
      tip,
      isNew: true,
      isIdempotent: false,
      state: 'verified',
    });

    const response = await controller.verifyTip(confessionId, dto, {} as any);

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
    const controller = makeController({
      tip,
      isNew: false,
      isIdempotent: true,
      state: 'duplicate',
    });

    const response = await controller.verifyTip(confessionId, dto, {} as any);

    expect(response.state).toBe('duplicate');
    expect(response.isNew).toBe(false);
    expect(response.isIdempotent).toBe(true);
    expect(response.success).toBe(true);
  });
});
