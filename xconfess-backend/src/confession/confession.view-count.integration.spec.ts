import { Test, TestingModule } from '@nestjs/testing';
import { ConfessionService } from './confession.service';
import { AnonymousConfessionRepository } from './repository/confession.repository';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { AiModerationService } from '../moderation/ai-moderation.service';
import { ModerationRepositoryService } from '../moderation/moderation-repository.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { AppLogger } from '../logger/logger.service';
import { EncryptionService } from '../encryption/encryption.service';
import { StellarService } from '../stellar/stellar.service';
import { ContractService } from '../stellar/contract.service';
import { CacheService } from '../cache/cache.service';
import { TagService } from './tag.service';
import { encryptConfession } from '../utils/confession-encryption';
import { ConfigService } from '@nestjs/config';
import { AnomalyDetectionService } from '../anomaly/anomaly-detection.service';
import { ConfessionIdempotencyService } from './confession-idempotency.service';

const TEST_AES_KEY = '12345678901234567890123456789012';

describe('ConfessionService - View Counting (Integration-like)', () => {
  let service: ConfessionService;
  let repo: AnonymousConfessionRepository;
  let viewCache: ConfessionViewCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionService,
        {
          provide: AnonymousConfessionRepository,
          useValue: {
            findOne: jest.fn(),
            incrementViewCountAtomically: jest.fn(),
          },
        },
        {
          provide: ConfessionViewCacheService,
          useValue: {
            checkAndMarkView: jest.fn(),
          },
        },
        { provide: AiModerationService, useValue: {} },
        { provide: ModerationRepositoryService, useValue: {} },
        { provide: EventEmitter2, useValue: {} },
        { provide: AnonymousUserService, useValue: {} },
        { provide: AppLogger, useValue: { log: jest.fn(), error: jest.fn() } },
        { provide: EncryptionService, useValue: {} },
        { provide: StellarService, useValue: {} },
        { provide: ContractService, useValue: {} },
        {
          provide: CacheService,
          useValue: {
            buildKey: jest.fn((...parts: (string | number)[]) =>
              parts.join(':'),
            ),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: TagService, useValue: {} },
        {
          provide: AnomalyDetectionService,
          useValue: { getAdjustmentFactor: jest.fn().mockResolvedValue(1) },
        },
        { provide: ConfessionIdempotencyService, useValue: {} },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(TEST_AES_KEY) },
        },
      ],
    }).compile();

    service = module.get<ConfessionService>(ConfessionService);
    repo = module.get<AnonymousConfessionRepository>(
      AnonymousConfessionRepository,
    );
    viewCache = module.get<ConfessionViewCacheService>(
      ConfessionViewCacheService,
    );
  });

  it('should increment view count exactly once for same user/IP in 1 hour', async () => {
    const confessionId = 'test-uuid';
    const encrypted = encryptConfession('test message', TEST_AES_KEY);
    const mockConfession = {
      id: confessionId,
      message: encrypted,
      view_count: 5,
    };

    // First call: new view
    (repo.findOne as jest.Mock).mockResolvedValueOnce(mockConfession);
    (viewCache.checkAndMarkView as jest.Mock).mockResolvedValueOnce(true);
    (repo.incrementViewCountAtomically as jest.Mock).mockResolvedValueOnce(
      undefined,
    );
    (repo.findOne as jest.Mock).mockResolvedValueOnce({
      ...mockConfession,
      view_count: 6,
    });

    const req = { ip: '1.2.3.4', headers: {} } as any;
    const firstResult = await service.getConfessionByIdWithViewCount(
      confessionId,
      req,
    );

    expect(firstResult!.view_count).toBe(6);
    expect(repo.incrementViewCountAtomically).toHaveBeenCalledWith(
      confessionId,
    );
    expect(viewCache.checkAndMarkView).toHaveBeenCalledWith(
      confessionId,
      '1.2.3.4',
    );

    // Second call: existing view (deduplicated by cache)
    (repo.findOne as jest.Mock).mockResolvedValueOnce({
      ...mockConfession,
      view_count: 6,
    });
    (viewCache.checkAndMarkView as jest.Mock).mockResolvedValueOnce(false);

    const secondResult = await service.getConfessionByIdWithViewCount(
      confessionId,
      req,
    );

    expect(secondResult!.view_count).toBe(6);
    expect(repo.incrementViewCountAtomically).toHaveBeenCalledTimes(1); // Still only 1 call
  });

  it('should increment view count for different IPs', async () => {
    const confessionId = 'test-uuid';
    const encrypted = encryptConfession('test message', TEST_AES_KEY);

    // IP 1
    (repo.findOne as jest.Mock).mockResolvedValueOnce({
      id: confessionId,
      message: encrypted,
      view_count: 10,
    });
    (viewCache.checkAndMarkView as jest.Mock).mockResolvedValueOnce(true);
    (repo.findOne as jest.Mock).mockResolvedValueOnce({
      id: confessionId,
      message: encrypted,
      view_count: 11,
    });

    await service.getConfessionByIdWithViewCount(confessionId, {
      ip: '1.1.1.1',
      headers: {},
    } as any);

    // IP 2
    (repo.findOne as jest.Mock).mockResolvedValueOnce({
      id: confessionId,
      message: encrypted,
      view_count: 11,
    });
    (viewCache.checkAndMarkView as jest.Mock).mockResolvedValueOnce(true);
    (repo.findOne as jest.Mock).mockResolvedValueOnce({
      id: confessionId,
      message: encrypted,
      view_count: 12,
    });

    const result = await service.getConfessionByIdWithViewCount(confessionId, {
      ip: '2.2.2.2',
      headers: {},
    } as any);

    expect(result!.view_count).toBe(12);
    expect(repo.incrementViewCountAtomically).toHaveBeenCalledTimes(2);
  });
});
