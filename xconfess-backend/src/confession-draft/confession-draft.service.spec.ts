import { ConflictException, NotFoundException } from '@nestjs/common';
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

  beforeEach(async () => {
    repo = {
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionDraftService,
        { provide: getRepositoryToken(ConfessionDraft), useValue: repo },
        { provide: ConfessionService, useValue: { create: jest.fn() } },
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

  it('enforces a 10 draft limit per user', async () => {
    repo.count.mockResolvedValue(10);

    await expect(service.createDraft(1, 'over limit')).rejects.toThrow(
      'Draft limit reached (max 10)',
    );
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

    it('version-mismatch conflict carries reason, currentVersion and remote content', async () => {
      const draft = {
        id: 'draft1',
        userId: 1,
        content: encryptConfession('server content', AES_KEY),
        version: 2,
        revisions: [],
        status: ConfessionDraftStatus.DRAFT,
      } as any;

      repo.findOne.mockResolvedValue(draft);

      expect.assertions(4);
      try {
        await service.updateDraft(1, 'draft1', {
          content: 'stale client content',
          version: 1,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as any;
        expect(body.reason).toBe('remote_updated');
        expect(body.currentVersion).toBe(2);
        expect(body.currentDraft.content).toBe('server content');
      }
    });

    it('throws a remote_deleted conflict when a versioned update targets a missing draft', async () => {
      repo.findOne.mockResolvedValue(null);

      expect.assertions(3);
      try {
        await service.updateDraft(1, 'gone', {
          content: 'offline edit',
          version: 3,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as any;
        expect(body.reason).toBe('remote_deleted');
        expect(body.draftId).toBe('gone');
      }
    });

    it('still throws a plain NotFoundException for an unversioned update to a missing draft', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.updateDraft(1, 'gone', { content: 'no version' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows autosave updates without a version', async () => {
      const draft = {
        id: 'draft1',
        userId: 1,
        content: encryptConfession('old content', AES_KEY),
        version: 2,
        revisions: [],
        status: ConfessionDraftStatus.DRAFT,
      } as any;

      repo.findOne.mockResolvedValue(draft);
      repo.save.mockImplementation(async (x: any) => x);

      const res = await service.autoSaveDraft(1, {
        id: 'draft1',
        content: 'autosaved content',
        category: 'female',
      });

      expect(res.content).toBe('autosaved content');
      expect(res.category).toBe('female');
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
