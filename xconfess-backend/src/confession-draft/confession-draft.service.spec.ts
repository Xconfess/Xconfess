import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ConfessionDraftService } from './confession-draft.service';
import {
  ConfessionDraft,
  ConfessionDraftStatus,
} from './entities/confession-draft.entity';
import { ConfessionService } from '../confession/confession.service';
import { encryptConfession } from '../utils/confession-encryption';

const AES_KEY = '12345678901234567890123456789012';

describe('ConfessionDraftService', () => {
  let service: ConfessionDraftService;
  let repo: jest.Mocked<Repository<ConfessionDraft>>;
  let confessionService: { create: jest.Mock };

  beforeEach(async () => {
    repo = {
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as any;

    confessionService = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionDraftService,
        { provide: getRepositoryToken(ConfessionDraft), useValue: repo },
        { provide: ConfessionService, useValue: confessionService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app.confessionAesKey') return AES_KEY;
              return null;
            }),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(async (cb: any) =>
              cb({ getRepository: () => repo }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(ConfessionDraftService);
  });

  it('createDraft encrypts content and returns decrypted content', async () => {
    repo.count.mockResolvedValue(0);
    repo.create.mockImplementation((x: any) => x);
    repo.save.mockImplementation(async (x: any) => ({
      ...x,
      id: 'draft1',
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduledFor: null,
      timezone: null,
      status: ConfessionDraftStatus.DRAFT,
      publishAttempts: 0,
      lastPublishError: null,
    }));

    const res = await service.createDraft(1, 'hello');
    expect(res.content).toBe('hello');
  });

  it('listDrafts returns decrypted drafts for the authenticated user', async () => {
    repo.find.mockResolvedValue([
      {
        id: 'draft1',
        userId: 1,
        content: encryptConfession('hello from draft', AES_KEY),
        revisions: [],
        status: ConfessionDraftStatus.DRAFT,
      } as any,
    ]);

    const res = await service.listDrafts(1);

    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 1 },
      order: { updatedAt: 'DESC' },
    });
    expect(res).toEqual([
      expect.objectContaining({
        id: 'draft1',
        content: 'hello from draft',
      }),
    ]);
  });

  it('publishNow creates a confession and marks the draft as posted', async () => {
    const draft = {
      id: 'draft1',
      userId: 1,
      content: encryptConfession('ready to publish', AES_KEY),
      revisions: [],
      status: ConfessionDraftStatus.DRAFT,
      scheduledFor: new Date(),
      publishAttempts: 2,
      lastPublishError: 'previous failure',
    } as any;

    repo.findOne.mockResolvedValue(draft);
    repo.save.mockImplementation(async (x: any) => x);
    confessionService.create.mockResolvedValue({ id: 'confession1' });

    const res = await service.publishNow(1, 'draft1');

    expect(confessionService.create).toHaveBeenCalledWith(
      { message: 'ready to publish' },
      expect.any(Object),
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ConfessionDraftStatus.POSTED,
        scheduledFor: null,
        publishAttempts: 0,
        lastPublishError: null,
      }),
    );
    expect(res.confession).toEqual({ id: 'confession1' });
    expect(res.draft.content).toBe('ready to publish');
  });

  describe('updateDraft', () => {
    it('successfully updates and saves revision when version matches', async () => {
      const draft = {
        id: 'draft1',
        userId: 1,
        content: encryptConfession('old content', AES_KEY),
        version: 1,
        revisions: [],
        status: ConfessionDraftStatus.DRAFT,
      } as any;

      repo.findOne.mockResolvedValue(draft);
      repo.save.mockImplementation(async (x: any) => ({
        ...x,
        version: x.version + 1,
      }));

      const res = await service.updateDraft(1, 'draft1', {
        content: 'new content',
        version: 1,
      });

      expect(res.content).toBe('new content');
      expect(res.revisions).toHaveLength(1);
      expect(res.revisions[0].content).toBe('old content');
      expect(res.revisions[0].version).toBe(1);
    });

    it('throws ConflictException when version mismatch', async () => {
      const draft = {
        id: 'draft1',
        userId: 1,
        content: encryptConfession('server content', AES_KEY),
        version: 2,
        revisions: [],
        status: ConfessionDraftStatus.DRAFT,
      } as any;

      repo.findOne.mockResolvedValue(draft);

      await expect(
        service.updateDraft(1, 'draft1', {
          content: 'stale client content',
          version: 1,
        }),
      ).rejects.toThrow('Conflict detected');
    });

    it('bounds revision history to 10 entries', async () => {
      const oldRevisions = Array(10)
        .fill(null)
        .map((_, i) => ({
          content: encryptConfession(`rev-${i}`, AES_KEY),
          version: i,
          createdAt: new Date(),
        }));

      const draft = {
        id: 'draft1',
        userId: 1,
        content: encryptConfession('current', AES_KEY),
        version: 10,
        revisions: [...oldRevisions],
        status: ConfessionDraftStatus.DRAFT,
      } as any;

      repo.findOne.mockResolvedValue(draft);
      repo.save.mockImplementation(async (x: any) => x);

      const res = await service.updateDraft(1, 'draft1', {
        content: 'newest',
        version: 10,
      });

      expect(res.revisions).toHaveLength(10);
      expect(res.revisions[0].content).toBe('current');
      expect(res.revisions[9].content).toBe('rev-8');
    });
  });
});
