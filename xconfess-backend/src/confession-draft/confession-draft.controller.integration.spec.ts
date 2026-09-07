import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfessionService } from '../confession/confession.service';
import { ConfessionDraftController } from './confession-draft.controller';
import { ConfessionDraftService } from './confession-draft.service';
import {
  ConfessionDraft,
  ConfessionDraftStatus,
} from './entities/confession-draft.entity';

const AES_KEY = '12345678901234567890123456789012';
const USER_ID = 42;

describe('ConfessionDraftController (integration)', () => {
  let app: INestApplication;
  let repo: jest.Mocked<Repository<ConfessionDraft>>;
  const confessionService = {
    create: jest.fn(),
  };
  let drafts: ConfessionDraft[];
  let nextId: number;

  beforeAll(async () => {
    repo = {
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<ConfessionDraft>>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfessionDraftController],
      providers: [
        ConfessionDraftService,
        { provide: getRepositoryToken(ConfessionDraft), useValue: repo },
        { provide: ConfessionService, useValue: confessionService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'app.confessionAesKey' ? AES_KEY : undefined,
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: (callback: (manager: any) => unknown) =>
              callback({ getRepository: () => repo }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = { id: USER_ID };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    drafts = [];
    nextId = 1;
    jest.clearAllMocks();

    repo.count.mockImplementation(async ({ where }: any) =>
      drafts.filter((draft) => draft.userId === where.userId).length,
    );
    repo.create.mockImplementation((draft: any) => draft);
    repo.save.mockImplementation(async (draft: any) => {
      const existing = drafts.find((stored) => stored.id === draft.id);
      const now = new Date();
      const saved = {
        ...draft,
        id: draft.id ?? `draft-${nextId++}`,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        version: existing ? existing.version + 1 : 1,
        revisions: draft.revisions ?? [],
        publishAttempts: draft.publishAttempts ?? 0,
        lastPublishError: draft.lastPublishError ?? null,
      } as ConfessionDraft;

      drafts = existing
        ? drafts.map((stored) => (stored.id === saved.id ? saved : stored))
        : [...drafts, saved];
      return saved;
    });
    repo.find.mockImplementation(async ({ where }: any) =>
      drafts
        .filter((draft) => draft.userId === where.userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    );
    repo.findOne.mockImplementation(async ({ where }: any) =>
      drafts.find((draft) => draft.id === where.id) ?? null,
    );
    confessionService.create.mockResolvedValue({ id: 'confession-1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, lists, and publishes an authenticated user draft', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/confessions/drafts')
      .set('Authorization', 'Bearer test-token')
      .send({ content: 'A private draft' })
      .expect(201);

    expect(createResponse.body).toEqual(
      expect.objectContaining({
        id: 'draft-1',
        content: 'A private draft',
        status: ConfessionDraftStatus.DRAFT,
      }),
    );
    expect(repo.count).toHaveBeenCalledWith({ where: { userId: USER_ID } });

    const listResponse = await request(app.getHttpServer())
      .get('/api/confessions/drafts')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(listResponse.body).toEqual([
      expect.objectContaining({ id: 'draft-1', content: 'A private draft' }),
    ]);

    const publishResponse = await request(app.getHttpServer())
      .post('/api/confessions/drafts/draft-1/publish')
      .set('Authorization', 'Bearer test-token')
      .expect(201);

    expect(confessionService.create).toHaveBeenCalledWith(
      { message: 'A private draft' },
      expect.anything(),
    );
    expect(publishResponse.body.draft).toEqual(
      expect.objectContaining({
        id: 'draft-1',
        content: 'A private draft',
        status: ConfessionDraftStatus.POSTED,
      }),
    );
  });

  describe('versioned updates (offline sync conflict handling)', () => {
    const auth = (req: request.Test) =>
      req.set('Authorization', 'Bearer test-token');

    const seedDraft = async () => {
      const res = await auth(
        request(app.getHttpServer()).post('/api/confessions/drafts'),
      )
        .send({ content: 'base content' })
        .expect(201);
      return res.body as { id: string; version: number };
    };

    it('applies a version-matched update and bumps the version', async () => {
      const draft = await seedDraft();

      const res = await auth(
        request(app.getHttpServer()).patch(
          `/api/confessions/drafts/${draft.id}`,
        ),
      )
        .send({ content: 'synced edit', version: draft.version })
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          id: draft.id,
          content: 'synced edit',
          version: draft.version + 1,
        }),
      );
    });

    it('rejects a stale update with a remote_updated conflict and returns the current draft', async () => {
      const draft = await seedDraft();

      await auth(
        request(app.getHttpServer()).patch(
          `/api/confessions/drafts/${draft.id}`,
        ),
      )
        .send({ content: 'first writer wins', version: draft.version })
        .expect(200);

      const res = await auth(
        request(app.getHttpServer()).patch(
          `/api/confessions/drafts/${draft.id}`,
        ),
      )
        .send({ content: 'stale offline edit', version: draft.version })
        .expect(409);

      expect(res.body).toEqual(
        expect.objectContaining({
          reason: 'remote_updated',
          currentVersion: draft.version + 1,
          currentDraft: expect.objectContaining({
            id: draft.id,
            content: 'first writer wins',
          }),
        }),
      );
    });

    it('reports a remote_deleted conflict when a versioned update targets a missing draft', async () => {
      const res = await auth(
        request(app.getHttpServer()).patch(
          '/api/confessions/drafts/00000000-0000-0000-0000-000000000000',
        ),
      )
        .send({ content: 'offline edit for a deleted draft', version: 4 })
        .expect(409);

      expect(res.body).toEqual(
        expect.objectContaining({
          reason: 'remote_deleted',
          draftId: '00000000-0000-0000-0000-000000000000',
        }),
      );
    });

    it('still 404s an unversioned update to a missing draft', async () => {
      await auth(
        request(app.getHttpServer()).patch(
          '/api/confessions/drafts/00000000-0000-0000-0000-000000000000',
        ),
      )
        .send({ content: 'no version supplied' })
        .expect(404);
    });
  });
});
