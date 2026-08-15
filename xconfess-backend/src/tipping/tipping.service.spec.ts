/**
 * TippingService unit tests
 *
 * Covers:
 *   - Normal tip creation flow
 *   - Idempotent replay (concurrent verify calls → single credit)  [issue #1480]
 *   - Aggregate totals updated exactly once                         [issue #1480]
 *   - Audit log emits exactly one TIP_SETTLEMENT_VERIFIED event    [issue #1480]
 *   - Same-txId / different-confession conflict
 *   - Error paths (confession not found, invalid tx, below minimum, no XLM op)
 *   - Correlation log fields (requestId propagation)
 *   - Tip stats
 */
import { TippingService } from './tipping.service';
import { Tip, TipVerificationStatus } from './entities/tip.entity';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePgUniqueViolationError(): QueryFailedError {
  const err = new QueryFailedError('INSERT', [], new Error('unique violation'));
  (err as any).code = '23505';
  return err;
}

/** Build a minimal mock service instance with controllable dependencies. */
function makeService(overrides: {
  tipRepo?: Partial<any>;
  confessionRepo?: Partial<any>;
  stellarService?: Partial<any>;
  eventEmitter?: Partial<any>;
  auditLogService?: Partial<any>;
} = {}) {
  const tipRepo: any = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto: any) => ({ ...dto, id: 'tip-123' })),
    save: jest.fn((tip: any) =>
      Promise.resolve({ ...tip, id: tip.id ?? 'tip-123' }),
    ),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    })),
    manager: {
      transaction: jest.fn((cb: any) =>
        cb({ getRepository: jest.fn(() => tipRepo) }),
      ),
    },
    ...overrides.tipRepo,
  };

  const confessionRepo: any = {
    findOne: jest.fn(),
    ...overrides.confessionRepo,
  };

  const stellarService: any = {
    verifyTransaction: jest.fn(),
    getHorizonTxUrl: jest.fn().mockReturnValue('https://horizon/testnet/txs/tx123'),
    ...overrides.stellarService,
  };

  const eventEmitter: any = {
    emit: jest.fn(),
    ...overrides.eventEmitter,
  };

  const auditLogService: any = {
    log: jest.fn().mockResolvedValue(undefined),
    ...overrides.auditLogService,
  };

  const svc = new TippingService(
    tipRepo,
    confessionRepo,
    stellarService,
    eventEmitter,
    auditLogService,
  );

  return { svc, tipRepo, confessionRepo, stellarService, eventEmitter, auditLogService };
}

/** Default happy-path fetch mock (1.0 XLM from GABC123). */
function mockHorizonFetch(amount = '1.0', from = 'GABC123') {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        _embedded: {
          operations: [{ type: 'payment', asset_type: 'native', amount, from }],
        },
      }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TippingService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Core verification flow ──────────────────────────────────────────────
  describe('verifyAndRecordTip — happy path', () => {
    const confessionId = 'confession-123';
    const dto = { txId: 'a'.repeat(64) };

    it('creates a new tip for a valid transaction', async () => {
      const { svc, tipRepo, confessionRepo, stellarService } = makeService();

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });
      // sentinel INSERT succeeds (no existing row)
      tipRepo.save.mockResolvedValue({ id: 'tip-123', txId: dto.txId, confessionId, amount: 0 });
      // txId conflict check — no conflicting row
      tipRepo.findOne.mockResolvedValue(null);
      stellarService.verifyTransaction.mockResolvedValue(true);
      mockHorizonFetch();

      const result = await svc.verifyAndRecordTip(confessionId, dto);

      expect(result.isNew).toBe(true);
      expect(result.isIdempotent).toBe(false);
      expect(tipRepo.save).toHaveBeenCalled();
    });

    it('passes requestId to stellarService.verifyTransaction', async () => {
      const { svc, tipRepo, confessionRepo, stellarService } = makeService();
      const requestId = 'req-uuid-789';

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });
      tipRepo.save
        .mockResolvedValueOnce({ id: 'tip-123', txId: dto.txId, confessionId, amount: 0 })
        .mockResolvedValue({ id: 'tip-123', txId: dto.txId, confessionId, amount: 1.0, verificationStatus: TipVerificationStatus.VERIFIED });
      tipRepo.findOne.mockResolvedValue(null);
      stellarService.verifyTransaction.mockResolvedValue(true);
      mockHorizonFetch();

      await svc.verifyAndRecordTip(confessionId, dto, requestId);

      expect(stellarService.verifyTransaction).toHaveBeenCalledWith(dto.txId, requestId);
    });

    it('emits start and success log entries with correlation fields', async () => {
      const { svc, tipRepo, confessionRepo, stellarService } = makeService();
      const requestId = 'req-log-test';

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });
      tipRepo.save
        .mockResolvedValueOnce({ id: 'tip-123', txId: dto.txId, confessionId, amount: 0 })
        .mockResolvedValue({ id: 'tip-123', txId: dto.txId, confessionId, amount: 1.0, verificationStatus: TipVerificationStatus.VERIFIED });
      tipRepo.findOne.mockResolvedValue(null);
      stellarService.verifyTransaction.mockResolvedValue(true);
      mockHorizonFetch();

      const logSpy = jest.spyOn((svc as any).logger, 'log');

      const result = await svc.verifyAndRecordTip(confessionId, dto, requestId);

      // start log
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ requestId, confessionId, txHash: dto.txId }),
      );
      // success log
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Tip verify succeeded',
          requestId,
          confessionId,
          txHash: dto.txId,
          tipId: result.tip.id,
        }),
      );
    });
  });

  // ── Error paths ────────────────────────────────────────────────────────
  describe('verifyAndRecordTip — error paths', () => {
    const confessionId = 'confession-123';
    const dto = { txId: 'b'.repeat(64) };

    it('throws NotFoundException when confession does not exist', async () => {
      const { svc, confessionRepo } = makeService();
      confessionRepo.findOne.mockResolvedValue(null);

      await expect(svc.verifyAndRecordTip(confessionId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when stellar transaction is invalid', async () => {
      const { svc, tipRepo, confessionRepo, stellarService } = makeService();

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });
      tipRepo.save.mockResolvedValue({ id: 'tip-123', txId: dto.txId, confessionId, amount: 0 });
      tipRepo.findOne.mockResolvedValue(null);
      stellarService.verifyTransaction.mockResolvedValue(false);

      await expect(svc.verifyAndRecordTip(confessionId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when amount is below the 0.1 XLM minimum', async () => {
      const { svc, tipRepo, confessionRepo, stellarService } = makeService();

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });
      tipRepo.save.mockResolvedValue({ id: 'tip-123', txId: dto.txId, confessionId, amount: 0 });
      tipRepo.findOne.mockResolvedValue(null);
      stellarService.verifyTransaction.mockResolvedValue(true);
      mockHorizonFetch('0.01');

      await expect(svc.verifyAndRecordTip(confessionId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when transaction has no XLM payment operation', async () => {
      const { svc, tipRepo, confessionRepo, stellarService } = makeService();

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });
      tipRepo.save.mockResolvedValue({ id: 'tip-123', txId: dto.txId, confessionId, amount: 0 });
      tipRepo.findOne.mockResolvedValue(null);
      stellarService.verifyTransaction.mockResolvedValue(true);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ _embedded: { operations: [] } }),
      });

      await expect(svc.verifyAndRecordTip(confessionId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ConflictException when txId is already bound to a different confession', async () => {
      const { svc, tipRepo, confessionRepo } = makeService();

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });
      // sentinel INSERT succeeds for our confessionId
      tipRepo.save.mockResolvedValue({ id: 'tip-123', txId: dto.txId, confessionId, amount: 0 });
      // txId conflict check finds a row for a different confession
      tipRepo.findOne.mockResolvedValue({
        id: 'tip-other',
        txId: dto.txId,
        confessionId: 'different-confession',
        verificationStatus: TipVerificationStatus.VERIFIED,
      });

      await expect(svc.verifyAndRecordTip(confessionId, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── Issue #1480: Concurrent verify calls — double-credit prevention ────
  describe('verifyAndRecordTip — race condition / double-credit prevention [#1480]', () => {
    const confessionId = 'confession-race';
    const txId = 'c'.repeat(64);
    const dto = { txId };

    /**
     * Simulates the DB-level unique violation that occurs when a second
     * concurrent call tries to INSERT the sentinel row with the same
     * idempotency_key (PG error 23505).
     *
     * Expected behaviour: the second call detects `isFirstWriter: false`,
     * reads the canonical tip row from the DB, and returns it as an
     * idempotent replay — without calling StellarService or saving anything.
     */
    it('concurrent verify calls create only one tip row (DB unique violation path)', async () => {
      const { svc, tipRepo, confessionRepo, stellarService, auditLogService } = makeService();

      const savedTip: Partial<Tip> = {
        id: 'tip-race',
        txId,
        confessionId,
        amount: 1.0,
        idempotencyKey: (svc as any).generateIdempotencyKey(confessionId, txId),
        verificationStatus: TipVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
        createdAt: new Date(),
      };

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });

      // First call: sentinel INSERT succeeds.
      // Second call: sentinel INSERT throws PG 23505 unique violation.
      tipRepo.save
        .mockResolvedValueOnce({ ...savedTip, id: 'tip-race', amount: 0 }) // first writer — sentinel
        .mockResolvedValue({ ...savedTip }); // first writer — finalise

      // Second-caller path: findOne returns the canonical row.
      tipRepo.findOne
        .mockResolvedValueOnce(null)  // first call's txId conflict check
        .mockResolvedValueOnce(savedTip as Tip); // second call's re-read after 23505

      stellarService.verifyTransaction.mockResolvedValue(true);
      mockHorizonFetch('1.0');

      // -- First caller wins the race --
      const firstResult = await svc.verifyAndRecordTip(confessionId, dto);
      expect(firstResult.isNew).toBe(true);
      expect(firstResult.isIdempotent).toBe(false);

      // -- Simulate second caller hitting PG 23505 on INSERT --
      tipRepo.save.mockRejectedValueOnce(makePgUniqueViolationError());
      // After 23505, service re-reads the canonical tip
      tipRepo.findOne.mockResolvedValueOnce(savedTip as Tip);

      const secondResult = await svc.verifyAndRecordTip(confessionId, dto);

      expect(secondResult.isNew).toBe(false);
      expect(secondResult.isIdempotent).toBe(true);
      expect(secondResult.tip.id).toBe('tip-race');

      // StellarService must only have been called once (by the first writer)
      expect(stellarService.verifyTransaction).toHaveBeenCalledTimes(1);
    });

    /**
     * Aggregate totals: the tip amount is written to the DB exactly once.
     * tipRepository.save should be called for the finalise step (setting
     * VERIFIED), but never for the idempotent-replay path.
     */
    it('aggregate totals update exactly once — save called only on the first writer', async () => {
      const { svc, tipRepo, confessionRepo, stellarService } = makeService();

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });
      tipRepo.findOne.mockResolvedValue(null);
      stellarService.verifyTransaction.mockResolvedValue(true);
      mockHorizonFetch('2.5');

      const sentinelRow = { id: 'tip-agg', txId, confessionId, amount: 0 };
      const finalRow = { ...sentinelRow, amount: 2.5, verificationStatus: TipVerificationStatus.VERIFIED };

      tipRepo.save
        .mockResolvedValueOnce(sentinelRow)  // sentinel INSERT
        .mockResolvedValueOnce(finalRow);    // finalise (single credit write)

      await svc.verifyAndRecordTip(confessionId, dto);

      // Exactly two saves: one sentinel + one finalise = one credit
      expect(tipRepo.save).toHaveBeenCalledTimes(2);

      // Now simulate a replay (23505 path) — save must NOT be called again
      tipRepo.save.mockRejectedValueOnce(makePgUniqueViolationError());
      tipRepo.findOne.mockResolvedValueOnce(finalRow as any);

      await svc.verifyAndRecordTip(confessionId, dto);

      // Still two saves — replay did not write anything
      expect(tipRepo.save).toHaveBeenCalledTimes(2);
    });

    /**
     * Audit log must emit TIP_SETTLEMENT_VERIFIED exactly once per unique
     * (confession, tx) pair, even when concurrent duplicate calls arrive.
     */
    it('audit log emits exactly one TIP_SETTLEMENT_VERIFIED event per settlement', async () => {
      const { svc, tipRepo, confessionRepo, stellarService, auditLogService } = makeService();

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });
      tipRepo.findOne.mockResolvedValue(null);
      stellarService.verifyTransaction.mockResolvedValue(true);
      mockHorizonFetch('1.0');

      const sentinelRow = { id: 'tip-audit', txId, confessionId, amount: 0 };
      const finalRow = {
        ...sentinelRow,
        amount: 1.0,
        verificationStatus: TipVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
      };

      tipRepo.save
        .mockResolvedValueOnce(sentinelRow)
        .mockResolvedValueOnce(finalRow);

      // First request — first writer
      await svc.verifyAndRecordTip(confessionId, dto);

      expect(auditLogService.log).toHaveBeenCalledTimes(1);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'tip_settlement_verified',
          metadata: expect.objectContaining({
            confessionId,
            txId,
            entityType: 'tip',
          }),
        }),
      );

      // Second request — idempotent replay via 23505
      auditLogService.log.mockClear();
      tipRepo.save.mockRejectedValueOnce(makePgUniqueViolationError());
      tipRepo.findOne.mockResolvedValueOnce(finalRow as any);

      await svc.verifyAndRecordTip(confessionId, dto);

      // Audit log must NOT have been called again
      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    /**
     * When N concurrent callers all race to verify the same transaction,
     * exactly one should receive isNew=true and the rest isIdempotent=true.
     * Simulates this with Promise.all and a shared call counter.
     */
    it('N concurrent verify calls → exactly 1 first-writer, N-1 idempotent replays', async () => {
      const N = 5;
      let insertCallCount = 0;

      const { svc, tipRepo, confessionRepo, stellarService } = makeService();

      confessionRepo.findOne.mockResolvedValue({ id: confessionId });
      stellarService.verifyTransaction.mockResolvedValue(true);
      mockHorizonFetch('1.0');

      const sentinelRow = { id: 'tip-concurrent', txId, confessionId, amount: 0 };
      const finalRow = {
        ...sentinelRow,
        amount: 1.0,
        verificationStatus: TipVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
        idempotencyKey: (svc as any).generateIdempotencyKey(confessionId, txId),
      };

      // First INSERT wins; all subsequent ones throw 23505.
      tipRepo.save.mockImplementation((row: any) => {
        if (row.verificationStatus === TipVerificationStatus.PENDING) {
          // sentinel INSERT
          insertCallCount++;
          if (insertCallCount === 1) {
            return Promise.resolve({ ...sentinelRow });
          }
          return Promise.reject(makePgUniqueViolationError());
        }
        // finalise write (first writer only)
        return Promise.resolve({ ...finalRow });
      });

      let idempotencyReads = 0;
      tipRepo.findOne.mockImplementation(({ where }: any) => {
        if (where?.idempotencyKey) {
          idempotencyReads++;
          return Promise.resolve(idempotencyReads <= N ? null : finalRow);
        }
        return Promise.resolve(null);
      });

      const results = await Promise.all(
        Array.from({ length: N }, () =>
          svc.verifyAndRecordTip(confessionId, dto),
        ),
      );

      const newCount = results.filter((r) => r.isNew).length;
      const idempotentCount = results.filter((r) => r.isIdempotent).length;

      expect(newCount).toBe(1);
      expect(idempotentCount).toBe(N - 1);
      expect(stellarService.verifyTransaction).toHaveBeenCalledTimes(1);
    });
  });

  // ── getTipStats ─────────────────────────────────────────────────────────
  describe('getTipStats', () => {
    it('calculates correct aggregate stats', async () => {
      const { svc, tipRepo } = makeService();
      tipRepo.find.mockResolvedValue([
        { id: '1', amount: 1.0 },
        { id: '2', amount: 2.0 },
        { id: '3', amount: 3.0 },
      ]);

      const stats = await svc.getTipStats('confession-123');

      expect(stats.totalAmount).toBe(6.0);
      expect(stats.totalCount).toBe(3);
      expect(stats.averageAmount).toBe(2.0);
    });

    it('handles zero tips gracefully', async () => {
      const { svc, tipRepo } = makeService();
      tipRepo.find.mockResolvedValue([]);

      const stats = await svc.getTipStats('confession-123');

      expect(stats.totalAmount).toBe(0);
      expect(stats.totalCount).toBe(0);
      expect(stats.averageAmount).toBe(0);
    });
  });
});
