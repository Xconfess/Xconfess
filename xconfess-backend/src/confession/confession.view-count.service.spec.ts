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

describe('ConfessionService - View Count Logic', () => {
  let service: ConfessionService;
  let repo: AnonymousConfessionRepository;
  let cache: ConfessionViewCacheService;

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
        {
          provide: AiModerationService,
          useValue: { moderateContent: jest.fn() },
        },
        {
          provide: ModerationRepositoryService,
          useValue: { createLog: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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
          useValue: {
            getAdjustmentFactor: jest.fn().mockResolvedValue(1),
          },
        },
        {
          provide: ConfessionIdempotencyService,
          useValue: {},
        },
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
    cache = module.get<ConfessionViewCacheService>(ConfessionViewCacheService);
  });

  it('should increment view count if not viewed recently', async () => {
    const encrypted = encryptConfession('hello', TEST_AES_KEY);
    (repo.findOne as jest.Mock).mockResolvedValue({
      id: '1',
      message: encrypted,
      view_count: 0,
    });
    (cache.checkAndMarkView as jest.Mock).mockResolvedValue(true);
    (repo.incrementViewCountAtomically as jest.Mock).mockResolvedValue(
      undefined,
    );
    (repo.findOne as jest.Mock)
      .mockResolvedValueOnce({ id: '1', message: encrypted, view_count: 0 })
      .mockResolvedValueOnce({
        id: '1',
        message: encrypted,
        view_count: 1,
      });

    const req = { user: { id: 'user1' }, ip: '127.0.0.1', headers: {} };
    const confession = await service.getConfessionByIdWithViewCount(
      '1',
      req as any,
    );
    expect(confession!.view_count).toBe(1);
  });

  it('should not increment view count if viewed recently', async () => {
    const encrypted = encryptConfession('hello', TEST_AES_KEY);
    (repo.findOne as jest.Mock).mockResolvedValue({
      id: '1',
      message: encrypted,
      view_count: 5,
    });
    (cache.checkAndMarkView as jest.Mock).mockResolvedValue(false);

    const req = { user: { id: 'user1' }, ip: '127.0.0.1', headers: {} };
    const confession = await service.getConfessionByIdWithViewCount(
      '1',
      req as any,
    );
    expect(confession!.view_count).toBe(5);
    expect(cache.checkAndMarkView).toHaveBeenCalled();
    expect(repo.incrementViewCountAtomically).not.toHaveBeenCalled();
  });

  it('should handle anonymous users using IP address', async () => {
    const encrypted = encryptConfession('hello', TEST_AES_KEY);
    (repo.findOne as jest.Mock).mockResolvedValue({
      id: '1',
      message: encrypted,
      view_count: 0,
    });
    (cache.checkAndMarkView as jest.Mock).mockResolvedValue(true);
    (repo.incrementViewCountAtomically as jest.Mock).mockResolvedValue(
      undefined,
    );
    (repo.findOne as jest.Mock)
      .mockResolvedValueOnce({ id: '1', message: encrypted, view_count: 0 })
      .mockResolvedValueOnce({
        id: '1',
        message: encrypted,
        view_count: 1,
      });

    const req = { ip: '192.168.1.1', headers: {} }; // No user property
    const result = await service.getConfessionByIdWithViewCount(
      '1',
      req as any,
    );

    expect(result!.view_count).toBe(1);
    expect(cache.checkAndMarkView).toHaveBeenCalledWith('1', '192.168.1.1');
  });
});
