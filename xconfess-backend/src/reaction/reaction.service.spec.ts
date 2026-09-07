import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { ReactionService } from './reaction.service';
import { Reaction } from './entities/reaction.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { ReactionsGateway } from './reactions.gateway';
import { createAnonymousOwnershipFixture } from '../../test/utils/anonymous-ownership.factory';

// ─── Factories ───────────────────────────────────────────────────────────────

const makeConfession = (
  overrides: Partial<AnonymousConfession> = {},
): AnonymousConfession =>
  ({
    id: 'conf-uuid-1',
    message: 'Test confession',
    moderationStatus: 'approved',
    isDeleted: false,
    isHidden: false,
    reactions: [],
    ...overrides,
  }) as AnonymousConfession;

const makeAnonymousUser = (
  overrides: Partial<AnonymousUser> = {},
): AnonymousUser =>
  ({
    id: 'anon-uuid-1',
    ...overrides,
  }) as AnonymousUser;

const makeReaction = (overrides: Partial<Reaction> = {}): Reaction =>
  ({
    id: 'react-uuid-1',
    emoji: '❤️',
    confession: makeConfession(),
    anonymousUser: makeAnonymousUser(),
    createdAt: new Date(),
    ...overrides,
  }) as Reaction;

// ─── Repo mock factory ────────────────────────────────────────────────────────

const repoMock = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  count: jest.fn().mockResolvedValue(1),
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ReactionService', () => {
  let service: ReactionService;
  let reactionRepo: ReturnType<typeof repoMock>;
  let confessionRepo: ReturnType<typeof repoMock>;
  let anonymousUserRepo: ReturnType<typeof repoMock>;
  // inner manager repo shared so transaction-based calls can be asserted
  let managerReactionRepo: ReturnType<typeof repoMock>;
  let managerOutboxRepo: ReturnType<typeof repoMock>;
  let gatewayMock: jest.Mocked<ReactionsGateway>;

  beforeEach(async () => {
    managerReactionRepo = repoMock();
    managerOutboxRepo = repoMock();

    gatewayMock = {
      broadcastReactionAdded: jest.fn(),
      broadcastReactionRemoved: jest.fn(),
      broadcastConfessionUpdated: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReactionService,
        { provide: getRepositoryToken(Reaction), useFactory: repoMock },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useFactory: repoMock,
        },
        { provide: getRepositoryToken(AnonymousUser), useFactory: repoMock },
        { provide: getRepositoryToken(OutboxEvent), useFactory: repoMock },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation((cb: any) =>
              cb({
                getRepository: jest.fn().mockImplementation((entity: any) => {
                  if (entity === Reaction) return managerReactionRepo;
                  return managerOutboxRepo;
                }),
              }),
            ),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            invalidateTrendingCache: jest.fn().mockResolvedValue(undefined),
            invalidateReactionDistributionCache: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        { provide: ReactionsGateway, useValue: gatewayMock },
      ],
    }).compile();

    service = module.get<ReactionService>(ReactionService);
    reactionRepo = module.get(getRepositoryToken(Reaction));
    confessionRepo = module.get(getRepositoryToken(AnonymousConfession));
    anonymousUserRepo = module.get(getRepositoryToken(AnonymousUser));
  });

  afterEach(() => jest.clearAllMocks());

  // ── Happy path ──────────────────────────────────────────────────────────────

  describe('createReaction()', () => {
    const dto = {
      confessionId: 'conf-uuid-1',
      anonymousUserId: 'anon-uuid-1',
      emoji: '❤️',
    };

    it('creates and returns a new reaction (happy path)', async () => {
      const confession = makeConfession();
      const user = makeAnonymousUser();
      const reaction = makeReaction({ confession, anonymousUser: user });

      confessionRepo.findOne.mockResolvedValue(confession);
      anonymousUserRepo.findOne.mockResolvedValue(user);
      // Duplicate check and save are inside the transaction (manager repo)
      managerReactionRepo.findOne.mockResolvedValue(null);
      managerReactionRepo.create.mockReturnValue(reaction);
      managerReactionRepo.save.mockResolvedValue(reaction);
      managerReactionRepo.count.mockResolvedValue(1);

      const result = await service.createReaction(dto);

      // Confession loaded with relations for notification lookup, excluding soft-deleted
      expect(confessionRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: dto.confessionId, isDeleted: false },
        }),
      );

      expect(managerReactionRepo.create).toHaveBeenCalledWith({
        emoji: dto.emoji,
        confession,
        anonymousUser: user,
      });
      expect(managerReactionRepo.save).toHaveBeenCalledWith(reaction);
      expect(result).toEqual(reaction);
    });

    it('returns existing reaction idempotently when same emoji is sent again', async () => {
      const existing = makeReaction({ emoji: '❤️' });

      confessionRepo.findOne.mockResolvedValue(makeConfession());
      anonymousUserRepo.findOne.mockResolvedValue(makeAnonymousUser());
      managerReactionRepo.findOne.mockResolvedValue(existing);

      const result = await service.createReaction(dto);

      expect(managerReactionRepo.create).not.toHaveBeenCalled();
      expect(managerReactionRepo.save).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('updates emoji when user switches reaction', async () => {
      const existing = makeReaction({ emoji: '😂' });
      const updated = { ...existing, emoji: '❤️' } as Reaction;

      confessionRepo.findOne.mockResolvedValue(makeConfession());
      anonymousUserRepo.findOne.mockResolvedValue(makeAnonymousUser());
      managerReactionRepo.findOne.mockResolvedValue(existing);
      managerReactionRepo.save.mockResolvedValue(updated);

      const result = await service.createReaction({ ...dto, emoji: '❤️' });

      expect(managerReactionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ emoji: '❤️' }),
      );
      expect(result.emoji).toBe('❤️');
    });

    // ── Invalid confession path ─────────────────────────────────────────────

    it('throws NotFoundException when confession does not exist', async () => {
      confessionRepo.findOne.mockResolvedValue(null);

      await expect(service.createReaction(dto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.createReaction(dto)).rejects.toThrow(
        'Confession not found',
      );

      // Must not proceed to user/reaction lookup
      expect(anonymousUserRepo.findOne).not.toHaveBeenCalled();
      expect(reactionRepo.create).not.toHaveBeenCalled();
    });

    // ── Soft-delete consistency (#1449) ─────────────────────────────────────

    it('throws NotFoundException when confession is soft-deleted', async () => {
      // The repository query filters isDeleted: false, so a soft-deleted
      // confession resolves as "not found" here, the same as a missing one.
      confessionRepo.findOne.mockResolvedValue(null);

      await expect(service.createReaction(dto)).rejects.toThrow(
        NotFoundException,
      );

      expect(confessionRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: dto.confessionId, isDeleted: false },
        }),
      );
      expect(anonymousUserRepo.findOne).not.toHaveBeenCalled();
      expect(reactionRepo.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when anonymous user does not exist', async () => {
      confessionRepo.findOne.mockResolvedValue(makeConfession());
      anonymousUserRepo.findOne.mockResolvedValue(null);

      await expect(service.createReaction(dto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.createReaction(dto)).rejects.toThrow(
        'Anonymous user not found',
      );

      expect(reactionRepo.create).not.toHaveBeenCalled();
    });

    it('allows an authenticated user to react with their linked anonymous identity', async () => {
      const fixture = createAnonymousOwnershipFixture();
      const user = fixture.ownerLinkedAnon;
      const reaction = makeReaction({ anonymousUser: user });

      confessionRepo.findOne.mockResolvedValue(makeConfession());
      anonymousUserRepo.findOne.mockResolvedValue(user);
      managerReactionRepo.findOne.mockResolvedValue(null);
      managerReactionRepo.create.mockReturnValue(reaction);
      managerReactionRepo.save.mockResolvedValue(reaction);

      const result = await service.createReaction(
        { ...dto, anonymousUserId: fixture.ownerLinkedAnonId },
        fixture.ownerUserId,
      );

      expect(result).toBe(reaction);
    });

    it('returns 404 when a user forges another account linked anonymous identity', async () => {
      const fixture = createAnonymousOwnershipFixture();

      confessionRepo.findOne.mockResolvedValue(makeConfession());
      anonymousUserRepo.findOne.mockResolvedValue(fixture.otherLinkedAnon);

      await expect(
        service.createReaction(
          { ...dto, anonymousUserId: fixture.otherLinkedAnonId },
          fixture.ownerUserId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(managerReactionRepo.create).not.toHaveBeenCalled();
    });

    it('keeps public reactions working for unlinked anonymous identities', async () => {
      const fixture = createAnonymousOwnershipFixture();
      const reaction = makeReaction({ anonymousUser: fixture.publicAnon });

      confessionRepo.findOne.mockResolvedValue(makeConfession());
      anonymousUserRepo.findOne.mockResolvedValue(fixture.publicAnon);
      managerReactionRepo.findOne.mockResolvedValue(null);
      managerReactionRepo.create.mockReturnValue(reaction);
      managerReactionRepo.save.mockResolvedValue(reaction);

      const result = await service.createReaction({
        ...dto,
        anonymousUserId: fixture.publicAnonId,
      });

      expect(result).toBe(reaction);
    });

    // ── Schema alignment guard ──────────────────────────────────────────────

    it('does NOT access confession.user at any point (invalid field guard)', async () => {
      /**
       * Regression guard: ensures the service never tries to access a `user`
       * property on AnonymousConfession — that field does not exist on the entity.
       * The correct field is `confession.anonymousUser` (the confession's owner).
       */
      const confession = makeConfession();
      const userAccessSpy = jest.fn();
      Object.defineProperty(confession, 'user', { get: userAccessSpy });

      confessionRepo.findOne.mockResolvedValue(confession);
      anonymousUserRepo.findOne.mockResolvedValue(makeAnonymousUser());
      managerReactionRepo.findOne.mockResolvedValue(null);
      managerReactionRepo.create.mockReturnValue(makeReaction());
      managerReactionRepo.save.mockResolvedValue(makeReaction());
      managerReactionRepo.count.mockResolvedValue(1);

      await service.createReaction(dto);

      expect(userAccessSpy).not.toHaveBeenCalled();
    });

    it('uses anonymousUser relation on Reaction entity, not a plain user field', async () => {
      const confession = makeConfession();
      const user = makeAnonymousUser();
      const reaction = makeReaction({ confession, anonymousUser: user });

      confessionRepo.findOne.mockResolvedValue(confession);
      anonymousUserRepo.findOne.mockResolvedValue(user);
      managerReactionRepo.findOne.mockResolvedValue(null);
      managerReactionRepo.create.mockReturnValue(reaction);
      managerReactionRepo.save.mockResolvedValue(reaction);
      managerReactionRepo.count.mockResolvedValue(1);

      await service.createReaction(dto);

      // Confirm create() was called with `anonymousUser`, NOT `user`
      expect(managerReactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ anonymousUser: user }),
      );
      expect(managerReactionRepo.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.anything() }),
      );
    });

    // ── Race condition: concurrent duplicate insert ────────────────────────

    it('handles race condition by returning existing reaction on unique violation', async () => {
      const confession = makeConfession();
      const user = makeAnonymousUser();
      const existing = makeReaction({ confession, anonymousUser: user });

      confessionRepo.findOne.mockResolvedValue(confession);
      anonymousUserRepo.findOne.mockResolvedValue(user);

      // First findOne inside transaction returns null (race window open)
      managerReactionRepo.findOne.mockResolvedValueOnce(null);

      // save throws unique-violation (SQLSTATE 23505)
      const uniqueError = new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );
      managerReactionRepo.save.mockRejectedValueOnce(uniqueError);

      // Re-fetch after constraint violation returns the winning row
      managerReactionRepo.findOne.mockResolvedValueOnce(existing);

      const result = await service.createReaction(dto);

      expect(result).toBe(existing);
      expect(managerReactionRepo.save).toHaveBeenCalledTimes(1);
      // findOne called twice: once before save, once after constraint violation
      expect(managerReactionRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('re-throws non-unique-violation QueryFailedErrors', async () => {
      const confession = makeConfession();
      const user = makeAnonymousUser();

      confessionRepo.findOne.mockResolvedValue(confession);
      anonymousUserRepo.findOne.mockResolvedValue(user);
      managerReactionRepo.findOne.mockResolvedValue(null);

      // save throws a different DB error (not unique violation)
      const dbError = new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('connection refused'), { code: '08006' }),
      );
      managerReactionRepo.save.mockRejectedValue(dbError);

      await expect(service.createReaction(dto)).rejects.toThrow(dbError);
    });

    // ── WebSocket broadcast ────────────────────────────────────────────────

    it('broadcasts reaction:added via gateway for a new reaction', async () => {
      const confession = makeConfession();
      const user = makeAnonymousUser();
      const reaction = makeReaction({ confession, anonymousUser: user });

      confessionRepo.findOne.mockResolvedValue(confession);
      anonymousUserRepo.findOne.mockResolvedValue(user);
      managerReactionRepo.findOne.mockResolvedValue(null);
      managerReactionRepo.create.mockReturnValue(reaction);
      managerReactionRepo.save.mockResolvedValue(reaction);
      managerReactionRepo.count.mockResolvedValue(3);
      reactionRepo.count.mockResolvedValue(3);

      await service.createReaction(dto);

      expect(gatewayMock.broadcastReactionAdded).toHaveBeenCalledWith(
        confession.id,
        expect.objectContaining({
          reactionId: reaction.id,
          userId: dto.anonymousUserId,
          reactionType: reaction.emoji,
          totalCount: 3,
        }),
      );
    });

    it('does NOT broadcast when reaction is idempotent (same emoji)', async () => {
      const existing = makeReaction({ emoji: '❤️' });

      confessionRepo.findOne.mockResolvedValue(makeConfession());
      anonymousUserRepo.findOne.mockResolvedValue(makeAnonymousUser());
      managerReactionRepo.findOne.mockResolvedValue(existing);

      await service.createReaction(dto);

      expect(gatewayMock.broadcastReactionAdded).not.toHaveBeenCalled();
      expect(gatewayMock.broadcastReactionRemoved).not.toHaveBeenCalled();
    });

    it('does NOT broadcast when emoji is updated (existing reaction changes)', async () => {
      const existing = makeReaction({ emoji: '😂' });
      const updated = { ...existing, emoji: '❤️' } as Reaction;

      confessionRepo.findOne.mockResolvedValue(makeConfession());
      anonymousUserRepo.findOne.mockResolvedValue(makeAnonymousUser());
      managerReactionRepo.findOne.mockResolvedValue(existing);
      managerReactionRepo.save.mockResolvedValue(updated);

      await service.createReaction({ ...dto, emoji: '❤️' });

      expect(gatewayMock.broadcastReactionAdded).not.toHaveBeenCalled();
    });
  });
});

// ─── Analytics cache invalidation ────────────────────────────────────────────

describe('ReactionService – analytics cache invalidation', () => {
  let service: ReactionService;
  let analyticsService: jest.Mocked<
    Pick<
      AnalyticsService,
      'invalidateTrendingCache' | 'invalidateReactionDistributionCache'
    >
  >;

  const makeManagerRepo = () => ({
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockReturnValue({ id: 'r1', emoji: '❤️' }),
    save: jest.fn().mockResolvedValue({ id: 'r1', emoji: '❤️' }),
    count: jest.fn().mockResolvedValue(1),
  });

  const confession = {
    id: 'conf-1',
    anonymousUser: null,
  } as any;

  const anonUser = { id: 'anon-1' } as any;

  const dto = {
    confessionId: 'conf-1',
    anonymousUserId: 'anon-1',
    emoji: '❤️',
  };

  beforeEach(async () => {
    analyticsService = {
      invalidateTrendingCache: jest.fn().mockResolvedValue(undefined),
      invalidateReactionDistributionCache: jest
        .fn()
        .mockResolvedValue(undefined),
    };

    const managerRepo = makeManagerRepo();
    const dataSourceMock = {
      transaction: jest
        .fn()
        .mockImplementation((cb: any) =>
          cb({ getRepository: jest.fn().mockReturnValue(managerRepo) }),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReactionService,
        {
          provide: getRepositoryToken(Reaction),
          useValue: { findOne: jest.fn(), create: jest.fn(), save: jest.fn(), count: jest.fn() },
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: { findOne: jest.fn().mockResolvedValue(confession) },
        },
        {
          provide: getRepositoryToken(AnonymousUser),
          useValue: { findOne: jest.fn().mockResolvedValue(anonUser) },
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: { findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        { provide: DataSource, useValue: dataSourceMock },
        { provide: AnalyticsService, useValue: analyticsService },
        {
          provide: ReactionsGateway,
          useValue: {
            broadcastReactionAdded: jest.fn(),
            broadcastReactionRemoved: jest.fn(),
            broadcastConfessionUpdated: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReactionService>(ReactionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('invalidates trending cache after a new reaction is persisted', async () => {
    await service.createReaction(dto);
    // Allow the fire-and-forget promises to settle
    await Promise.resolve();
    expect(analyticsService.invalidateTrendingCache).toHaveBeenCalledWith(
      'reaction-mutation',
    );
  });

  it('invalidates reaction distribution cache after a new reaction is persisted', async () => {
    await service.createReaction(dto);
    await Promise.resolve();
    expect(
      analyticsService.invalidateReactionDistributionCache,
    ).toHaveBeenCalledWith('reaction-mutation');
  });

  it('does NOT call analytics invalidation when confession is not found', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReactionService,
        {
          provide: getRepositoryToken(Reaction),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: getRepositoryToken(AnonymousUser),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: { findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: AnalyticsService, useValue: analyticsService },
        {
          provide: ReactionsGateway,
          useValue: {
            broadcastReactionAdded: jest.fn(),
            broadcastReactionRemoved: jest.fn(),
            broadcastConfessionUpdated: jest.fn(),
          },
        },
      ],
    }).compile();

    const svc = module.get<ReactionService>(ReactionService);
    await expect(svc.createReaction(dto)).rejects.toThrow(NotFoundException);
    expect(analyticsService.invalidateTrendingCache).not.toHaveBeenCalled();
    expect(
      analyticsService.invalidateReactionDistributionCache,
    ).not.toHaveBeenCalled();
  });
});
