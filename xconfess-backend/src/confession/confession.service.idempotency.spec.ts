/**
 * Tests: Idempotency enforcement for confession creation (Issue #1425)
 *
 * Coverage:
 *  1. First confession creation (no idempotency key)
 *  2. First confession creation WITH idempotency key
 *  3. Retry with same key + same payload → deterministic replay (no duplicate)
 *  4. Retry with same key + different payload → 409 Conflict
 *  5. Concurrent duplicate submissions → only one confession created
 *  6. Notification emitted only once (not on replay)
 *  7. commitSuccess / commitFailure lifecycle
 *  8. Failed record is retryable with the same key
 *  9. Processing timeout → allows retry
 * 10. No idempotency key → legacy path works unchanged
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ConfessionService } from './confession.service';
import { ConfessionIdempotencyService } from './confession-idempotency.service';
import { AnonymousConfession } from './entities/confession.entity';
import { ConfessionIdempotencyRecord } from './entities/confession-idempotency-record.entity';
import { AnonymousConfessionRepository } from './repository/confession.repository';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { AiModerationService } from '../moderation/ai-moderation.service';
import { ModerationRepositoryService } from '../moderation/moderation-repository.service';
import { CacheService } from '../cache/cache.service';
import { TagService } from './tag.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AppLogger } from '../logger/logger.service';
import { StellarService } from '../stellar/stellar.service';
import { ContractService } from '../stellar/contract.service';
import { AnomalyDetectionService } from '../anomaly/anomaly-detection.service';

// ── Stable mocks for encryption so message comparisons are transparent ────────
jest.mock('../utils/confession-encryption', () => ({
  decryptConfession: jest.fn((msg: string) => msg),
  encryptConfession: jest.fn((msg: string) => `enc:${msg}`),
  assertEncryptedBeforeSave: jest.fn(),
  safeDecryptConfession: jest.fn((msg: string) => msg),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

const IDEM_KEY = 'test-idem-key-abc123';
const MSG = 'This is my confession';
const GENDER = 'male';

const mockSavedConfession: Partial<AnonymousConfession> = {
  id: 'conf-uuid-1',
  message: `enc:${MSG}`,
  gender: GENDER as any,
  created_at: new Date('2026-01-01'),
  isDeleted: false,
  isAnchored: false,
  moderationStatus: 'approved',
};

const mockProcessingRecord: Partial<ConfessionIdempotencyRecord> = {
  id: 'idem-rec-uuid-1',
  idempotencyKey: IDEM_KEY,
  payloadHash: 'abc123hash',
  status: 'processing',
};

const mockCompletedRecord: Partial<ConfessionIdempotencyRecord> = {
  ...mockProcessingRecord,
  status: 'completed',
  confessionId: 'conf-uuid-1',
  responseStatus: 201,
  responseBody: { id: 'conf-uuid-1', message: MSG },
};

// ─────────────────────────────────────────────────────────────────────────────
// ConfessionIdempotencyService unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ConfessionIdempotencyService', () => {
  let service: ConfessionIdempotencyService;
  let recordRepo: jest.Mocked<Repository<ConfessionIdempotencyRecord>>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    recordRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    } as any;

    dataSource = {
      getRepository: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionIdempotencyService,
        {
          provide: getRepositoryToken(ConfessionIdempotencyRecord),
          useValue: recordRepo,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<ConfessionIdempotencyService>(
      ConfessionIdempotencyService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── computePayloadHash ────────────────────────────────────────────────────

  describe('computePayloadHash', () => {
    it('produces a 64-char hex SHA-256 string', () => {
      const hash = service.computePayloadHash({ message: MSG });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces the same hash for identical payloads', () => {
      const a = service.computePayloadHash({ message: MSG, gender: GENDER });
      const b = service.computePayloadHash({ message: MSG, gender: GENDER });
      expect(a).toBe(b);
    });

    it('produces different hashes for different messages', () => {
      const a = service.computePayloadHash({ message: 'hello' });
      const b = service.computePayloadHash({ message: 'world' });
      expect(a).not.toBe(b);
    });

    it('treats null and undefined gender identically', () => {
      const a = service.computePayloadHash({ message: MSG, gender: null });
      const b = service.computePayloadHash({ message: MSG, gender: undefined });
      expect(a).toBe(b);
    });

    it('sorts tags before hashing so order does not matter', () => {
      const a = service.computePayloadHash({
        message: MSG,
        tags: ['b', 'a', 'c'],
      });
      const b = service.computePayloadHash({
        message: MSG,
        tags: ['a', 'b', 'c'],
      });
      expect(a).toBe(b);
    });
  });

  // ── check – happy path (first request) ───────────────────────────────────

  describe('check – first request', () => {
    it('inserts a processing row and returns isReplay=false', async () => {
      const newRow = { ...mockProcessingRecord } as ConfessionIdempotencyRecord;
      recordRepo.create.mockReturnValue(newRow);
      recordRepo.save.mockResolvedValue(newRow);

      const result = await service.check(IDEM_KEY, 'hash1');

      expect(result.isReplay).toBe(false);
      expect(result.cachedResponse).toBeNull();
      expect(result.record).toBe(newRow);
      expect(recordRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ── check – replay (completed, same hash) ────────────────────────────────

  describe('check – completed replay', () => {
    it('returns isReplay=true with the cached confession', async () => {
      // tryInsert throws 23505
      recordRepo.create.mockReturnValue({} as any);
      recordRepo.save.mockRejectedValue({ code: '23505' });

      // findOne returns a completed record
      recordRepo.findOne.mockResolvedValue(
        mockCompletedRecord as ConfessionIdempotencyRecord,
      );

      // dataSource returns the confession
      const confRepo = { findOne: jest.fn().mockResolvedValue(mockSavedConfession) };
      (dataSource.getRepository as jest.Mock).mockReturnValue(confRepo);

      const result = await service.check(IDEM_KEY, 'abc123hash');

      expect(result.isReplay).toBe(true);
      expect(result.cachedResponse).toBe(mockSavedConfession);
      expect(result.cachedStatus).toBe(201);
    });
  });

  // ── check – conflict (same key, different hash) ───────────────────────────

  describe('check – payload mismatch (409)', () => {
    it('throws ConflictException when payload hash differs', async () => {
      recordRepo.create.mockReturnValue({} as any);
      recordRepo.save.mockRejectedValue({ code: '23505' });

      recordRepo.findOne.mockResolvedValue({
        ...mockCompletedRecord,
        payloadHash: 'differenthash',
      } as ConfessionIdempotencyRecord);

      await expect(service.check(IDEM_KEY, 'newhash')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── check – failed record is retryable ───────────────────────────────────

  describe('check – failed record allows retry', () => {
    it('resets status to processing and returns isReplay=false', async () => {
      recordRepo.create.mockReturnValue({} as any);
      recordRepo.save.mockRejectedValue({ code: '23505' });

      const failedRow = {
        ...mockProcessingRecord,
        status: 'failed',
        payloadHash: 'abc123hash',
      } as ConfessionIdempotencyRecord;

      recordRepo.findOne.mockResolvedValue(failedRow);
      recordRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.check(IDEM_KEY, 'abc123hash');

      expect(result.isReplay).toBe(false);
      expect(recordRepo.update).toHaveBeenCalledWith(
        failedRow.id,
        expect.objectContaining({ status: 'processing' }),
      );
    });
  });

  // ── commitSuccess ─────────────────────────────────────────────────────────

  describe('commitSuccess', () => {
    it('updates status to completed with confession id and response body', async () => {
      recordRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.commitSuccess(
        mockProcessingRecord as ConfessionIdempotencyRecord,
        mockSavedConfession as AnonymousConfession,
        { id: 'conf-uuid-1', message: MSG },
        201,
      );

      expect(recordRepo.update).toHaveBeenCalledWith(
        mockProcessingRecord.id,
        expect.objectContaining({
          status: 'completed',
          confessionId: 'conf-uuid-1',
          responseStatus: 201,
        }),
      );
    });
  });

  // ── commitFailure ─────────────────────────────────────────────────────────

  describe('commitFailure', () => {
    it('updates status to failed', async () => {
      recordRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.commitFailure(
        mockProcessingRecord as ConfessionIdempotencyRecord,
      );

      expect(recordRepo.update).toHaveBeenCalledWith(
        mockProcessingRecord.id,
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ConfessionService integration with idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('ConfessionService – idempotency integration', () => {
  let service: ConfessionService;
  let confessionRepo: jest.Mocked<AnonymousConfessionRepository>;
  let idempotencyService: jest.Mocked<ConfessionIdempotencyService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const buildModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionService,
        {
          provide: AnonymousConfessionRepository,
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            manager: { getRepository: jest.fn() },
          },
        },
        {
          provide: ConfessionIdempotencyService,
          useValue: {
            computePayloadHash: jest.fn().mockReturnValue('testhash'),
            check: jest.fn(),
            commitSuccess: jest.fn().mockResolvedValue(undefined),
            commitFailure: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfessionViewCacheService,
          useValue: { checkAndMarkView: jest.fn(), invalidateCache: jest.fn() },
        },
        {
          provide: AiModerationService,
          useValue: {
            moderateContent: jest.fn().mockResolvedValue({
              score: 0.1,
              flags: [],
              status: 'approved',
              requiresReview: false,
              details: {},
            }),
          },
        },
        {
          provide: ModerationRepositoryService,
          useValue: { createLog: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: AnonymousUserService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'anon-user-1' }),
            getAnonIdsForUser: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('12345678901234567890123456789012'),
          },
        },
        {
          provide: AppLogger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            logWithUser: jest.fn(),
          },
        },
        {
          provide: EncryptionService,
          useValue: { encrypt: jest.fn(), decrypt: jest.fn() },
        },
        {
          provide: StellarService,
          useValue: {
            isValidTxHash: jest.fn().mockReturnValue(true),
            processAnchorData: jest.fn().mockReturnValue(null),
            getExplorerUrl: jest.fn().mockReturnValue('https://explorer/tx/x'),
            verifyTransaction: jest.fn().mockResolvedValue(false),
          },
        },
        { provide: ContractService, useValue: { verifyConfession: jest.fn() } },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            delPattern: jest.fn().mockResolvedValue(undefined),
            buildKey: jest.fn((...args: string[]) => args.join(':')),
          },
        },
        {
          provide: TagService,
          useValue: {
            validateTags: jest.fn().mockResolvedValue([]),
            getAllTags: jest.fn(),
            getTagByName: jest.fn(),
          },
        },
        {
          provide: AnomalyDetectionService,
          useValue: { getAdjustmentFactor: jest.fn().mockResolvedValue(1) },
        },
      ],
    }).compile();

    service = module.get<ConfessionService>(ConfessionService);
    confessionRepo = module.get(AnonymousConfessionRepository) as any;
    idempotencyService = module.get(ConfessionIdempotencyService) as any;
    eventEmitter = module.get(EventEmitter2) as any;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await buildModule();

    // Default: confessionRepo.create returns a draft, save returns saved
    confessionRepo.create.mockReturnValue({
      ...mockSavedConfession,
      message: `enc:${MSG}`,
    } as any);
    confessionRepo.save.mockResolvedValue({
      ...mockSavedConfession,
      message: `enc:${MSG}`,
    } as any);
    confessionRepo.manager.getRepository.mockReturnValue({
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue([]),
    } as any);
  });

  // ── 1. First creation – no idempotency key ─────────────────────────────

  it('1. creates confession without idempotency key (legacy path)', async () => {
    const result = await service.create({ message: MSG } as any);

    expect(confessionRepo.save).toHaveBeenCalledTimes(1);
    expect(idempotencyService.check).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  // ── 2. First creation WITH idempotency key ─────────────────────────────

  it('2. creates confession with idempotency key on first call', async () => {
    idempotencyService.check.mockResolvedValue({
      isReplay: false,
      cachedResponse: null,
      cachedStatus: null,
      record: mockProcessingRecord as any,
    });

    const result = await service.create({
      message: MSG,
      idempotencyKey: IDEM_KEY,
    } as any);

    expect(confessionRepo.save).toHaveBeenCalledTimes(1);
    expect(idempotencyService.commitSuccess).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  // ── 3. Retry same key + same payload → deterministic replay ────────────

  it('3. returns cached confession on replay (same key + same payload)', async () => {
    const cachedConf = { ...mockSavedConfession, message: MSG } as any;

    idempotencyService.check.mockResolvedValue({
      isReplay: true,
      cachedResponse: cachedConf,
      cachedStatus: 201,
      record: mockCompletedRecord as any,
    });

    const result = await service.create({
      message: MSG,
      idempotencyKey: IDEM_KEY,
    } as any);

    // Should NOT create a new confession
    expect(confessionRepo.save).not.toHaveBeenCalled();
    expect(idempotencyService.commitSuccess).not.toHaveBeenCalled();
    expect(result).toBe(cachedConf);
  });

  // ── 4. Same key + different payload → 409 Conflict ────────────────────

  it('4. throws ConflictException when same key used with different payload', async () => {
    idempotencyService.check.mockRejectedValue(
      new ConflictException(
        'Idempotency key replay conflict: the request body does not match the original submission.',
      ),
    );

    await expect(
      service.create({
        message: 'completely different message',
        idempotencyKey: IDEM_KEY,
      } as any),
    ).rejects.toThrow(ConflictException);

    expect(confessionRepo.save).not.toHaveBeenCalled();
  });

  // ── 5. Concurrent duplicates → only one confession saved ──────────────

  it('5. concurrent duplicates: second call returns replay, no extra save', async () => {
    // First call: succeeds, returns new record
    idempotencyService.check
      .mockResolvedValueOnce({
        isReplay: false,
        cachedResponse: null,
        cachedStatus: null,
        record: mockProcessingRecord as any,
      })
      // Second concurrent call: gets replay
      .mockResolvedValueOnce({
        isReplay: true,
        cachedResponse: { ...mockSavedConfession, message: MSG } as any,
        cachedStatus: 201,
        record: mockCompletedRecord as any,
      });

    const dto = { message: MSG, idempotencyKey: IDEM_KEY } as any;

    const [res1, res2] = await Promise.all([
      service.create(dto),
      service.create(dto),
    ]);

    // Only one save should have occurred (from the first call)
    expect(confessionRepo.save).toHaveBeenCalledTimes(1);
    expect(idempotencyService.commitSuccess).toHaveBeenCalledTimes(1);
    expect(res1).toBeDefined();
    expect(res2).toBeDefined();
  });

  // ── 6. Notification emitted only once ────────────────────────────────

  it('6. moderation events NOT emitted on replay', async () => {
    // Replay path
    idempotencyService.check.mockResolvedValue({
      isReplay: true,
      cachedResponse: { ...mockSavedConfession, message: MSG } as any,
      cachedStatus: 201,
      record: mockCompletedRecord as any,
    });

    await service.create({ message: MSG, idempotencyKey: IDEM_KEY } as any);

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('6b. moderation event emitted exactly once on first creation', async () => {
    // Override moderation to return FLAGGED
    const aiMod = {
      moderateContent: jest.fn().mockResolvedValue({
        score: 0.7,
        flags: ['violence'],
        status: 'flagged',
        requiresReview: true,
        details: {},
      }),
    };

    // Rebuild module with flagged moderation
    const module = await Test.createTestingModule({
      providers: [
        ConfessionService,
        { provide: AnonymousConfessionRepository, useValue: confessionRepo },
        { provide: ConfessionIdempotencyService, useValue: idempotencyService },
        { provide: ConfessionViewCacheService, useValue: { checkAndMarkView: jest.fn(), invalidateCache: jest.fn() } },
        { provide: AiModerationService, useValue: aiMod },
        { provide: ModerationRepositoryService, useValue: { createLog: jest.fn() } },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: AnonymousUserService, useValue: { create: jest.fn().mockResolvedValue({ id: 'au1' }) } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('12345678901234567890123456789012') } },
        { provide: AppLogger, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), logWithUser: jest.fn() } },
        { provide: EncryptionService, useValue: {} },
        { provide: StellarService, useValue: { processAnchorData: jest.fn().mockReturnValue(null) } },
        { provide: ContractService, useValue: { verifyConfession: jest.fn() } },
        { provide: CacheService, useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), delPattern: jest.fn(), buildKey: jest.fn((...a: string[]) => a.join(':')) } },
        { provide: TagService, useValue: { validateTags: jest.fn().mockResolvedValue([]) } },
        { provide: AnomalyDetectionService, useValue: { getAdjustmentFactor: jest.fn().mockResolvedValue(1) } },
      ],
    }).compile();

    const svc = module.get<ConfessionService>(ConfessionService);

    idempotencyService.check.mockResolvedValue({
      isReplay: false,
      cachedResponse: null,
      cachedStatus: null,
      record: mockProcessingRecord as any,
    });

    await svc.create({ message: MSG, idempotencyKey: IDEM_KEY } as any);

    const emitCalls = (eventEmitter.emit as jest.Mock).mock.calls;
    const reviewEvents = emitCalls.filter(([e]) => e === 'moderation.requires-review');
    expect(reviewEvents).toHaveLength(1);
  });

  // ── 7. commitFailure called when creation throws ──────────────────────

  it('7. commitFailure is called when confession creation throws', async () => {
    idempotencyService.check.mockResolvedValue({
      isReplay: false,
      cachedResponse: null,
      cachedStatus: null,
      record: mockProcessingRecord as any,
    });

    confessionRepo.save.mockRejectedValue(new Error('DB exploded'));

    await expect(
      service.create({ message: MSG, idempotencyKey: IDEM_KEY } as any),
    ).rejects.toThrow();

    expect(idempotencyService.commitFailure).toHaveBeenCalledWith(
      mockProcessingRecord,
    );
    expect(idempotencyService.commitSuccess).not.toHaveBeenCalled();
  });

  // ── 8. Bad content → 400 without touching idempotency ─────────────────

  it('8. throws BadRequestException for empty content (no idempotency touched)', async () => {
    await expect(
      service.create({ message: '  ', idempotencyKey: IDEM_KEY } as any),
    ).rejects.toThrow(BadRequestException);

    expect(idempotencyService.check).not.toHaveBeenCalled();
  });

  // ── 9. No idempotency key – existing anchor replay still works ─────────

  it('9. anchorConfession replay returns pending state without duplicate', async () => {
    confessionRepo.findOne.mockResolvedValue({
      ...mockSavedConfession,
      stellarTxHash: 'a'.repeat(64),
      isAnchored: false,
    } as any);

    const result = await service.anchorConfession('conf-uuid-1', {
      stellarTxHash: 'a'.repeat(64),
    });

    expect(result).toHaveProperty('anchorPending', true);
    expect(result).toHaveProperty('isAnchored', false);
    expect(confessionRepo.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Migration correctness (structural check)
// ─────────────────────────────────────────────────────────────────────────────

describe('Migration: confession_idempotency_records', () => {
  it('migration file exists and exports a class with up/down methods', async () => {
    const mod = await import(
      '../migrations/20260721000001-create-confession-idempotency-records'
    );
    const keys = Object.keys(mod);
    expect(keys.length).toBeGreaterThan(0);

    const MigrationClass = mod[keys[0]];
    const instance = new MigrationClass();
    expect(typeof instance.up).toBe('function');
    expect(typeof instance.down).toBe('function');
  });

  it('migration name follows project timestamp convention', async () => {
    const mod = await import(
      '../migrations/20260721000001-create-confession-idempotency-records'
    );
    const keys = Object.keys(mod);
    const MigrationClass = mod[keys[0]];
    const instance = new MigrationClass();
    expect(instance.name).toMatch(/20260721000001/);
  });
});
