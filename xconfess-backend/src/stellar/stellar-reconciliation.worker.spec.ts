import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StellarReconciliationWorker } from './stellar-reconciliation.worker';
import { StellarAnchor, AnchorStatus } from './entities/stellar-anchor.entity';
import { StellarService } from './stellar.service';
import { ContractService } from './contract.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ConfigService } from '@nestjs/config';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Mock decryptConfession
jest.mock('../utils/confession-encryption', () => ({
  decryptConfession: jest.fn().mockReturnValue('decrypted'),
}));

describe('StellarReconciliationWorker', () => {
  let worker: StellarReconciliationWorker;
  let anchorRepository: any;
  let confessionRepository: any;
  let stellarService: any;
  let contractService: any;
  let auditService: any;
  let configService: any;

  beforeEach(async () => {
    anchorRepository = {
      find: jest.fn(),
      save: jest.fn(),
    };

    confessionRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    stellarService = {
      hashConfession: jest.fn().mockReturnValue('mockHash'),
    };

    contractService = {
      anchorConfession: jest.fn(),
      verifyConfession: jest.fn(),
    };

    stellarService.verifyTransaction = jest.fn();

    auditService = {
      log: jest.fn(),
    };

    configService = {
      get: jest.fn().mockReturnValue('secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarReconciliationWorker,
        {
          provide: getRepositoryToken(StellarAnchor),
          useValue: anchorRepository,
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: confessionRepository,
        },
        { provide: StellarService, useValue: stellarService },
        { provide: ContractService, useValue: contractService },
        { provide: AuditLogService, useValue: auditService },
        { provide: ConfigService, useValue: configService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    worker = module.get<StellarReconciliationWorker>(StellarReconciliationWorker);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Test 1: Success on submission moves status to OBSERVED', async () => {
    const oldDate = new Date(Date.now() - 10 * 60 * 1000);
    const anchor = {
      id: 'a1',
      status: AnchorStatus.PENDING,
      retryCount: 1,
      lastRetryAt: new Date(Date.now() - 5 * 60 * 1000), // > 4 min ago (2^1 * 2 = 4m)
      createdAt: oldDate,
      confessionId: 'c1',
    } as StellarAnchor;

    anchorRepository.find.mockResolvedValue([anchor]);
    confessionRepository.findOne.mockResolvedValue({ id: 'c1', message: 'enc' } as AnonymousConfession);

    contractService.anchorConfession.mockResolvedValue({ hash: 'txhash123' });

    await worker.reconcilePendingAnchors();

    // On initial submission, status transitions to OBSERVED (provisional)
    expect(anchor.status).toBe(AnchorStatus.OBSERVED);
    expect(anchor.retryCount).toBe(0);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: AuditActionType.STELLAR_ANCHOR_RETRY,
        metadata: expect.objectContaining({
          entityId: 'a1',
          confessionId: 'c1',
          result: 'observed',
          txHash: 'txhash123',
        }),
      }),
    );
    expect(anchorRepository.save).toHaveBeenCalledWith(anchor);
  });

  it('Test 2: Retry exhaustion', async () => {
    const oldDate = new Date(Date.now() - 40 * 60 * 1000);
    const anchor = {
      id: 'a2',
      status: AnchorStatus.PENDING,
      retryCount: 4,
      lastRetryAt: new Date(Date.now() - 35 * 60 * 1000), // > 32 min ago (2^4 * 2 = 32m)
      createdAt: oldDate,
      confessionId: 'c2',
    } as StellarAnchor;

    anchorRepository.find.mockResolvedValue([anchor]);
    confessionRepository.findOne.mockResolvedValue({ id: 'c2', message: 'enc' } as AnonymousConfession);

    contractService.anchorConfession.mockRejectedValue(new Error('Horizon failed'));

    await worker.reconcilePendingAnchors();

    expect(anchor.retryCount).toBe(5);
    expect(anchor.status).toBe(AnchorStatus.FAILED);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: AuditActionType.STELLAR_ANCHOR_RETRY,
        metadata: expect.objectContaining({
          entityId: 'a2',
          confessionId: 'c2',
          error_message: 'Horizon failed',
        }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: AuditActionType.STELLAR_ANCHOR_FAILED,
        metadata: expect.objectContaining({
          entityId: 'a2',
          confessionId: 'c2',
        }),
      }),
    );
  });

  it('Test 3: Only old records processed', async () => {
    const recentDate = new Date(Date.now() - 1 * 60 * 1000);
    const anchor = {
      id: 'a3',
      status: AnchorStatus.PENDING,
      retryCount: 1,
      lastRetryAt: recentDate,
      createdAt: new Date(),
      confessionId: 'c3',
    } as StellarAnchor;

    anchorRepository.find.mockResolvedValue([anchor]);

    await worker.reconcilePendingAnchors();

    expect(anchor.retryCount).toBe(1); // skipped
    expect(contractService.anchorConfession).not.toHaveBeenCalled();
  });

  it('executes without HTTP request context (no req, no middleware)', async () => {
    const oldDate = new Date(Date.now() - 10 * 60 * 1000);
    const anchor = {
      id: 'a5',
      status: AnchorStatus.PENDING,
      retryCount: 1,
      lastRetryAt: new Date(Date.now() - 5 * 60 * 1000),
      createdAt: oldDate,
      confessionId: 'c5',
    } as StellarAnchor;

    anchorRepository.find.mockResolvedValue([anchor]);
    confessionRepository.findOne.mockResolvedValue({ id: 'c5', message: 'enc' } as AnonymousConfession);
    contractService.anchorConfession.mockResolvedValue({ hash: 'txhash456' });

    await expect(worker.reconcilePendingAnchors()).resolves.not.toThrow();
    expect(anchor.status).toBe(AnchorStatus.OBSERVED);
  });

  it('Test 4: Audit log payload', async () => {
    const anchor = {
      id: 'a4',
      status: AnchorStatus.PENDING,
      retryCount: 2,
      lastRetryAt: new Date(Date.now() - 10 * 60 * 1000), // > 8 min ago (2^2 * 2 = 8m)
      createdAt: new Date(),
      confessionId: 'c4',
    } as StellarAnchor;

    anchorRepository.find.mockResolvedValue([anchor]);
    confessionRepository.findOne.mockResolvedValue({ id: 'c4', message: 'enc' } as AnonymousConfession);

    contractService.anchorConfession.mockRejectedValue(new Error('Test Error'));

    await worker.reconcilePendingAnchors();

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: AuditActionType.STELLAR_ANCHOR_RETRY,
        metadata: expect.objectContaining({
          entityId: 'a4',
          confessionId: 'c4',
          error_message: 'Test Error',
        }),
      }),
    );
  });

  describe('anchor payload verification (#1474)', () => {
    it('graduates an OBSERVED anchor to ANCHORED when the on-chain hash matches confession state', async () => {
      const anchor = {
        id: 'a6',
        status: AnchorStatus.OBSERVED,
        retryCount: 0,
        lastRetryAt: new Date(),
        createdAt: new Date(),
        confessionId: 'c6',
        stellarTxHash: 'txhash789',
      } as StellarAnchor;

      anchorRepository.find.mockResolvedValue([anchor]);
      const confession = {
        id: 'c6',
        message: 'enc',
        stellarHash: 'expectedHash',
        isAnchored: false,
      } as unknown as AnonymousConfession;
      confessionRepository.findOne.mockResolvedValue(confession);

      stellarService.verifyTransaction.mockResolvedValue(true);
      contractService.verifyConfession.mockResolvedValue(1_700_000_000_000);

      await worker.reconcilePendingAnchors();

      expect(contractService.verifyConfession).toHaveBeenCalledWith('expectedHash');
      expect(anchor.status).toBe(AnchorStatus.ANCHORED);
      expect(confessionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isAnchored: true }),
      );
    });

    it('rejects graduation to ANCHORED when the on-chain hash does not match confession state', async () => {
      const anchor = {
        id: 'a7',
        status: AnchorStatus.OBSERVED,
        retryCount: 0,
        lastRetryAt: new Date(),
        createdAt: new Date(),
        confessionId: 'c7',
        stellarTxHash: 'txhash999',
      } as StellarAnchor;

      anchorRepository.find.mockResolvedValue([anchor]);
      const confession = {
        id: 'c7',
        message: 'enc',
        stellarHash: 'expectedHash',
        isAnchored: false,
      } as unknown as AnonymousConfession;
      confessionRepository.findOne.mockResolvedValue(confession);

      stellarService.verifyTransaction.mockResolvedValue(true);
      // The transaction succeeded on Horizon, but the contract never recorded
      // this confession's hash — i.e. the tx hash points at unrelated data.
      contractService.verifyConfession.mockResolvedValue(null);

      await worker.reconcilePendingAnchors();

      expect(anchor.status).toBe(AnchorStatus.OBSERVED);
      expect(anchor.lastError).toMatch(/hash mismatch/i);
      expect(confession.isAnchored).toBe(false);
      expect(confessionRepository.save).not.toHaveBeenCalled();
    });
  });
});
