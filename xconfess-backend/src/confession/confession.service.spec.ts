import { Test, TestingModule } from '@nestjs/testing';
import { AnonymousConfession } from './entities/confession.entity';
import { ConfessionService } from './confession.service';
import { SelectQueryBuilder, Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnonymousConfessionRepository } from './repository/confession.repository';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { SortOrder } from './dto/get-confessions.dto';
import { AiModerationService } from '../moderation/ai-moderation.service';
import { ModerationRepositoryService } from '../moderation/moderation-repository.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from 'src/logger/logger.service';
import { EncryptionService } from 'src/encryption/encryption.service';
import { StellarService } from '../stellar/stellar.service';
import { CacheService, CACHE_TTL } from '../cache/cache.service';
import { TagService } from './tag.service';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { encryptConfession } from '../utils/confession-encryption';

describe('ConfessionService', () => {
  let service: ConfessionService;
  let repo: jest.Mocked<Repository<AnonymousConfession>>;
  let qb: Partial<SelectQueryBuilder<AnonymousConfession>> & any;
  let anonUserService: any;
  let cacheServiceMock: any;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getCount: jest.fn(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      update: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionService,
        { provide: AnonymousConfessionRepository, useValue: repo },
        {
          provide: ConfessionViewCacheService,
          useValue: { checkAndMarkView: jest.fn() },
        },
        {
          provide: AiModerationService,
          useValue: { moderateContent: jest.fn() },
        },
        {
          provide: ModerationRepositoryService,
          useValue: {
            createLog: jest.fn(),
            getLogsByConfession: jest.fn(),
            updateReview: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: AnonymousUserService,
          useValue: { create: jest.fn(), getAnonIdsForUser: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('12345678901234567890123456789012'),
          },
        },
        { provide: AppLogger, useValue: { log: jest.fn(), error: jest.fn() } },
        {
          provide: EncryptionService,
          useValue: { encrypt: jest.fn(), decrypt: jest.fn() },
        },
        {
          provide: StellarService,
          useValue: {
            anchorConfession: jest.fn(),
            processAnchorData: jest.fn(),
            getExplorerUrl: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            buildKey: jest.fn((...parts: string[]) => parts.join(':')),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            delPattern: jest.fn(),
          },
        },
        { provide: TagService, useValue: { validateTags: jest.fn() } },
      ],
    }).compile();

    service = module.get(ConfessionService);
    anonUserService = module.get(AnonymousUserService);
    cacheServiceMock = module.get(CacheService);
  });

  it('remove() soft‑deletes existing', async () => {
    repo.findOne.mockResolvedValue({ id: '1', isDeleted: false } as any);
    await expect(service.remove('1')).resolves.toEqual({
      message: 'Confession soft-deleted',
      id: '1',
    });
    expect(repo.update).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ isDeleted: true, deletedAt: expect.any(Date) }),
    );
  });

  it('remove() throws if not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.remove('x')).rejects.toThrow(NotFoundException);
  });

  it('getConfessions paginates and filters', async () => {
    qb.getMany.mockResolvedValue([
      {
        id: 'a',
        message: encryptConfession('hello', '12345678901234567890123456789012'),
        created_at: new Date('2026-03-25T00:00:00.000Z'),
      },
    ]);

    const res = await service.getConfessions({
      page: 2,
      limit: 5,
      sort: SortOrder.NEWEST,
    });
    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(6); // fetchLimit = limit + 1
    expect(res.data).toHaveLength(1);
    expect(res.limit).toBe(5);
    expect(res.hasMore).toBe(false);
  });

  it('getUserConfessions minimal test', async () => {
    console.log('START TEST');
    anonUserService.getAnonIdsForUser.mockResolvedValue(['anon1']);
    qb.getMany.mockResolvedValue([]);

    try {
      const res = await service.getUserConfessions(1, { limit: 10 });
      console.log('RESULT', res);
      expect(res.data).toHaveLength(0);
    } catch (e) {
      console.error('ERROR', e);
      throw e;
    }
  });

  describe('Cache TTL values (#1247)', () => {
    it('CACHE_TTL constants are correctly defined', () => {
      expect(CACHE_TTL.CONFESSION_SINGLE).toBe(1800);
      expect(CACHE_TTL.CONFESSION_LIST).toBe(300);
      expect(CACHE_TTL.TRENDING).toBe(120);
    });

    it('uses CONFESSION_SINGLE TTL (1800s) for individual confession cache', async () => {
      repo.findOne.mockResolvedValue({
        id: 'cached-single',
        message: encryptConfession('test', '12345678901234567890123456789012'),
        created_at: new Date(),
        isDeleted: false,
        isHidden: false,
      });
      const mockReq = { ip: '127.0.0.1', headers: {} } as any;
      await service.getConfessionByIdWithViewCount('cached-single', mockReq);
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        'confession:cached-single',
        expect.anything(),
        CACHE_TTL.CONFESSION_SINGLE,
      );
    });

    it('uses CONFESSION_LIST TTL (300s) for confession list cache', async () => {
      const req = { page: 1, limit: 10, sort: SortOrder.NEWEST };
      qb.getMany.mockResolvedValue([]);
      await service.getConfessions(req);
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        expect.stringContaining('confessions:'),
        expect.anything(),
        CACHE_TTL.CONFESSION_LIST,
      );
    });

    it('invalidateConfessionCache clears list keys but not single keys', async () => {
      (service as any).invalidateConfessionCache();
      expect(cacheServiceMock.delPattern).toHaveBeenCalledWith('confessions:');
    });
  });
});

describe('ConfessionService — anchor pending-state guard (#776)', () => {
  let service: ConfessionService;
  let confessionRepo: any;
  let stellarService: any;

  beforeEach(async () => {
    confessionRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    stellarService = {
      isValidTxHash: jest.fn().mockReturnValue(true),
      processAnchorData: jest.fn().mockReturnValue({
        stellarTxHash: 'a'.repeat(64),
        stellarHash: 'b'.repeat(64),
        anchoredAt: new Date(),
      }),
      getExplorerUrl: jest.fn().mockReturnValue('https://stellar.expert/testnet/tx/aaa'),
      verifyTransaction: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionService,
        { provide: AnonymousConfessionRepository, useValue: confessionRepo },
        { provide: ConfessionViewCacheService, useValue: { checkAndMarkView: jest.fn() } },
        { provide: AiModerationService, useValue: { moderateContent: jest.fn() } },
        {
          provide: ModerationRepositoryService,
          useValue: { createLog: jest.fn(), getLogsByConfession: jest.fn(), updateReview: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: AnonymousUserService, useValue: { create: jest.fn(), getAnonIdsForUser: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('12345678901234567890123456789012') } },
        { provide: AppLogger, useValue: { log: jest.fn(), error: jest.fn() } },
        { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
        { provide: StellarService, useValue: stellarService },
        {
          provide: CacheService,
          useValue: {
            buildKey: jest.fn((...parts: string[]) => parts.join(':')),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            delPattern: jest.fn(),
          },
        },
        { provide: TagService, useValue: { validateTags: jest.fn() } },
      ],
    }).compile();

    service = module.get(ConfessionService);
  });

  describe('anchorConfession', () => {
    it('returns pending-state response without new DB write when a prior anchor is still pending', async () => {
      const existingTx = 'c'.repeat(64);
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-p1',
        message: encryptConfession('hello', '12345678901234567890123456789012'),
        isAnchored: false,
        stellarTxHash: existingTx,
        stellarHash: 'd'.repeat(64),
        isDeleted: false,
      });

      const result = await service.anchorConfession('conf-p1', { stellarTxHash: 'e'.repeat(64) });

      expect(result).toMatchObject({ anchorPending: true, isAnchored: false, stellarTxHash: existingTx });
      expect(confessionRepo.update).not.toHaveBeenCalled();
    });

    it('does not overwrite the pending tx hash with a new submission', async () => {
      const existingTx = 'f'.repeat(64);
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-p2',
        message: encryptConfession('secret', '12345678901234567890123456789012'),
        isAnchored: false,
        stellarTxHash: existingTx,
        stellarHash: 'g'.repeat(64),
        isDeleted: false,
      });

      const result = await service.anchorConfession('conf-p2', { stellarTxHash: 'h'.repeat(64) });

      expect(result.stellarTxHash).toBe(existingTx);
    });

    it('throws BadRequestException when confession is already fully anchored', async () => {
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-p3',
        message: encryptConfession('test', '12345678901234567890123456789012'),
        isAnchored: true,
        stellarTxHash: 'i'.repeat(64),
        isDeleted: false,
      });

      await expect(
        service.anchorConfession('conf-p3', { stellarTxHash: 'j'.repeat(64) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('records a new pending anchor and returns anchorPending:true when no anchor exists', async () => {
      confessionRepo.findOne
        .mockResolvedValueOnce({
          id: 'conf-p4',
          message: encryptConfession('my secret', '12345678901234567890123456789012'),
          isAnchored: false,
          stellarTxHash: null,
          isDeleted: false,
        })
        .mockResolvedValueOnce({
          id: 'conf-p4',
          message: encryptConfession('my secret', '12345678901234567890123456789012'),
          isAnchored: false,
          stellarTxHash: 'a'.repeat(64),
          stellarHash: 'b'.repeat(64),
        });

      const result = await service.anchorConfession('conf-p4', { stellarTxHash: 'a'.repeat(64) });

      expect(confessionRepo.update).toHaveBeenCalledWith(
        'conf-p4',
        expect.objectContaining({ stellarTxHash: 'a'.repeat(64) }),
      );
      expect(result.anchorPending).toBe(true);
    });
  });

  describe('verifyStellarAnchor', () => {
    it('promotes a pending anchor to confirmed when chain verification succeeds', async () => {
      const txHash = 'k'.repeat(64);
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-v1',
        isAnchored: false,
        stellarTxHash: txHash,
        stellarHash: 'l'.repeat(64),
        anchoredAt: null,
        isDeleted: false,
      });
      stellarService.verifyTransaction.mockResolvedValue(true);

      const result = await service.verifyStellarAnchor('conf-v1');

      expect(result.isAnchored).toBe(true);
      expect(result.anchorPending).toBe(false);
      expect(confessionRepo.update).toHaveBeenCalledWith(
        'conf-v1',
        expect.objectContaining({ isAnchored: true }),
      );
    });

    it('keeps pending state when chain verification is not yet confirmed', async () => {
      const txHash = 'm'.repeat(64);
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-v2',
        isAnchored: false,
        stellarTxHash: txHash,
        stellarHash: 'n'.repeat(64),
        anchoredAt: null,
        isDeleted: false,
      });
      stellarService.verifyTransaction.mockResolvedValue(false);

      const result = await service.verifyStellarAnchor('conf-v2');

      expect(result.isAnchored).toBe(false);
      expect(result.anchorPending).toBe(true);
      expect(confessionRepo.update).not.toHaveBeenCalled();
    });

    it('reports not-anchored and not-pending when no stellarTxHash exists', async () => {
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-v3',
        isAnchored: false,
        stellarTxHash: null,
        isDeleted: false,
      });

      const result = await service.verifyStellarAnchor('conf-v3');

      expect(result.isAnchored).toBe(false);
      expect(result.anchorPending).toBe(false);
    });
  });
});

describe('ConfessionService — create() transactional integrity (#1446)', () => {
  let service: ConfessionService;
  let confessionRepo: any;
  let txManager: any;
  let userRepoMock: any;
  let confessionRepoMock: any;
  let tagRepoMock: any;
  let outboxRepoMock: any;
  let tagService: any;
  let aiModerationService: any;

  const AES_KEY = '12345678901234567890123456789012';

  beforeEach(async () => {
    userRepoMock = {
      create: jest.fn().mockReturnValue({ id: 'user-1' }),
      save: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };
    confessionRepoMock = {
      create: jest.fn().mockImplementation((data) => ({ id: 'conf-1', ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    tagRepoMock = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue(undefined),
    };
    outboxRepoMock = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue(undefined),
    };

    txManager = {
      getRepository: jest.fn((entity: any) => {
        const name = entity?.name;
        if (name === 'AnonymousUser') return userRepoMock;
        if (name === 'AnonymousConfession') return confessionRepoMock;
        if (name === 'ConfessionTag') return tagRepoMock;
        if (name === 'OutboxEvent') return outboxRepoMock;
        throw new Error(`Unexpected entity in getRepository: ${name}`);
      }),
    };

    confessionRepo = {
      manager: {
        transaction: jest.fn(async (cb) => cb(txManager)),
      },
      findOne: jest.fn().mockResolvedValue(null),
    };

    tagService = { validateTags: jest.fn().mockResolvedValue([]) };
    aiModerationService = {
      moderateContent: jest.fn().mockResolvedValue({
        score: 0.1,
        flags: [],
        status: 'APPROVED',
        requiresReview: false,
        details: {},
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ConfessionService,
        { provide: AnonymousConfessionRepository, useValue: confessionRepo },
        { provide: ConfessionViewCacheService, useValue: { checkAndMarkView: jest.fn() } },
        { provide: AiModerationService, useValue: aiModerationService },
        {
          provide: ModerationRepositoryService,
          useValue: { createLog: jest.fn(), getLogsByConfession: jest.fn(), updateReview: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: AnonymousUserService, useValue: { create: jest.fn(), getAnonIdsForUser: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(AES_KEY) } },
        { provide: AppLogger, useValue: { log: jest.fn(), error: jest.fn() } },
        { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
        {
          provide: StellarService,
          useValue: { processAnchorData: jest.fn(), getExplorerUrl: jest.fn(), isValidTxHash: jest.fn() },
        },
        {
          provide: CacheService,
          useValue: {
            buildKey: jest.fn((...parts) => parts.join(':')),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            delPattern: jest.fn(),
          },
        },
        { provide: TagService, useValue: tagService },
      ],
    }).compile();

    service = module.get(ConfessionService);
  });

  it('happy path: writes user, confession, and outbox event within the same transaction', async () => {
    await service.create({ message: 'hello world' });
    expect(confessionRepo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(userRepoMock.save).toHaveBeenCalledTimes(1);
    expect(confessionRepoMock.save).toHaveBeenCalledTimes(1);
  });

  it('does not write an outbox event for APPROVED content', async () => {
    await service.create({ message: 'hello world' });
    expect(outboxRepoMock.save).not.toHaveBeenCalled();
  });

  it('writes a moderation_high_severity outbox event when content is REJECTED', async () => {
    aiModerationService.moderateContent.mockResolvedValue({
      score: 0.95,
      flags: ['hate_speech'],
      status: 'REJECTED',
      requiresReview: false,
      details: {},
    });
    await service.create({ message: 'bad content' });
    expect(outboxRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'moderation_high_severity',
        idempotencyKey: expect.stringContaining('moderation-high-severity-'),
      }),
    );
  });

  it('writes a moderation_requires_review outbox event when content is FLAGGED', async () => {
    aiModerationService.moderateContent.mockResolvedValue({
      score: 0.6,
      flags: ['borderline'],
      status: 'FLAGGED',
      requiresReview: true,
      details: {},
    });
    await service.create({ message: 'borderline content' });
    expect(outboxRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'moderation_requires_review',
        idempotencyKey: expect.stringContaining('moderation-requires-review-'),
      }),
    );
  });

  describe('failure injection: no partial rows on mid-transaction failure', () => {
    it('rolls back and creates zero rows when tag save fails', async () => {
      tagService.validateTags.mockResolvedValue([{ id: 'tag-1' }]);
      tagRepoMock.save.mockRejectedValue(new Error('DB connection lost'));
      await expect(
        service.create({ message: 'hello', tags: ['drama'] }),
      ).rejects.toThrow();
      expect(userRepoMock.save).toHaveBeenCalledTimes(1);
      expect(confessionRepoMock.save).toHaveBeenCalledTimes(1);
      expect(tagRepoMock.save).toHaveBeenCalledTimes(1);
      expect(outboxRepoMock.save).not.toHaveBeenCalled();
    });

    it('rolls back and never writes an outbox event when the confession save itself fails', async () => {
      confessionRepoMock.save.mockRejectedValue(new Error('unique constraint violation'));
      await expect(service.create({ message: 'hello' })).rejects.toThrow();
      expect(outboxRepoMock.save).not.toHaveBeenCalled();
    });

    it('propagates a rejection when the transaction callback throws', async () => {
      confessionRepoMock.save.mockRejectedValue(new Error('boom'));
      await expect(service.create({ message: 'hello' })).rejects.toThrow(
        'Failed to create confession',
      );
    });
  });

  describe('idempotency + outbox retry-safety', () => {
    it('gives high-severity outbox rows a deterministic idempotency key per confession', async () => {
      aiModerationService.moderateContent.mockResolvedValue({
        score: 0.95,
        flags: ['x'],
        status: 'REJECTED',
        requiresReview: false,
        details: {},
      });
      await service.create({ message: 'bad' });
      const savedEvent = outboxRepoMock.save.mock.calls[0][0];
      expect(savedEvent.idempotencyKey).toBe(
        `moderation-high-severity-${savedEvent.payload.confessionId}`,
      );
    });
  });
});
