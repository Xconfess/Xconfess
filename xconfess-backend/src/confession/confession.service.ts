import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decodeCursor,
  encodeCursor,
  CursorPaginatedResponseDto,
} from '../common/pagination';
import { Brackets } from 'typeorm';
import { AnonymousConfessionRepository } from './repository/confession.repository';
import { CreateConfessionDto } from './dto/create-confession.dto';
import { GetConfessionsByTagDto } from './dto/get-confessions-by-tag.dto';
import { UpdateConfessionDto } from './dto/update-confession.dto';
import { SearchConfessionDto } from './dto/search-confession.dto';
import { GetConfessionsDto, SortOrder } from './dto/get-confessions.dto';
import sanitizeHtml from 'sanitize-html';
import {
  encryptConfession,
  decryptConfession,
  safeDecryptConfession,
  assertEncryptedBeforeSave,
} from '../utils/confession-encryption';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { Request } from 'express';
import {
  AiModerationService,
  ModerationStatus,
} from '../moderation/ai-moderation.service';
import { ModerationRepositoryService } from '../moderation/moderation-repository.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { EntityManager, Repository } from 'typeorm';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { AnonymousConfession } from './entities/confession.entity';
import { AppLogger } from '../logger/logger.service';
import { maskUserId } from '../utils/mask-user-id';
import { EncryptionService } from '../encryption/encryption.service';
import { ConfessionResponseDto } from './dto/confession-response.dto';
import { StellarService } from '../stellar/stellar.service';
import { ContractService } from '../stellar/contract.service';
import { AnchorConfessionDto } from '../stellar/dto/anchor-confession.dto';
import { CacheService, CACHE_TTL } from '../cache/cache.service';
import { TagService } from './tag.service';
import { ConfessionTag } from './entities/confession-tag.entity';
import { toWindowBoundaries, TrendingWindow } from '../types/analytics.types';
import { GetUserConfessionsDto } from './dto/get-user-confessions.dto';
import { mapToSlimConfession } from './utils/confession-mapper';
import { AnomalyDetectionService } from '../anomaly/anomaly-detection.service';
import { ConfessionIdempotencyService } from './confession-idempotency.service';

@Injectable()
export class ConfessionService {
  constructor(
    private readonly confessionRepo: AnonymousConfessionRepository,
    private viewCache: ConfessionViewCacheService,
    private readonly aiModerationService: AiModerationService,
    private readonly moderationRepoService: ModerationRepositoryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly anonymousUserService: AnonymousUserService,
    private readonly logger: AppLogger,
    private encryptionService: EncryptionService,
    private readonly stellarService: StellarService,
    private readonly contractService: ContractService,
    private readonly cacheService: CacheService,
    private readonly tagService: TagService,
    private readonly configService: ConfigService,
    private readonly anomalyDetection: AnomalyDetectionService,
    private readonly idempotencyService: ConfessionIdempotencyService,
  ) {}

  private get aesKey(): string {
    return this.configService.get<string>('app.confessionAesKey', '');
  }

  private sanitizeMessage(message: string): string {
    return sanitizeHtml(message, {
      allowedTags: [],
      allowedAttributes: {},
      disallowedTagsMode: 'recursiveEscape',
    }).trim();
  }

  async create(dto: CreateConfessionDto, manager?: EntityManager) {
    // Only use 'message' as canonical field
    const msg = this.sanitizeMessage(dto.message);
    if (!msg) throw new BadRequestException('Invalid confession content');

    // ── Idempotency check ─────────────────────────────────────────────────
    if (dto.idempotencyKey) {
      const payloadHash = this.idempotencyService.computePayloadHash({
        message: msg,
        gender: dto.gender ?? null,
        tags: dto.tags ?? null,
        stellarTxHash: dto.stellarTxHash ?? null,
      });

      const idempotencyResult = await this.idempotencyService.check(
        dto.idempotencyKey,
        payloadHash,
      );

      if (idempotencyResult.isReplay) {
        // Return the canonical cached response without re-creating anything.
        const cached = idempotencyResult.cachedResponse;
        if (cached) {
          cached.message = decryptConfession(cached.message, this.aesKey);
        }
        return cached;
      }

      // First occurrence: run creation, then commit idempotency record.
      let savedConfession: AnonymousConfession;
      try {
        savedConfession = await this.executeCreate(dto, msg, manager);
      } catch (err) {
        await this.idempotencyService.commitFailure(idempotencyResult.record);
        throw err;
      }

      await this.idempotencyService.commitSuccess(
        idempotencyResult.record,
        savedConfession,
        { id: savedConfession.id, message: msg },
        201,
      );

      return savedConfession;
    }

    // No idempotency key – run creation directly (legacy / optional path).
    return this.executeCreate(dto, msg, manager);
  }

  /**
   * Core confession creation logic, extracted so it can be called both from
   * the idempotency-guarded path and the legacy (no-key) path.
   */
  private async executeCreate(
    dto: CreateConfessionDto,
    msg: string,
    manager?: EntityManager,
  ): Promise<AnonymousConfession> {
    try {
      // Step 0: Validate tags if provided
      let validatedTags: any[] = [];
      if (dto.tags && dto.tags.length > 0) {
        validatedTags = await this.tagService.validateTags(dto.tags);
      }

      // Step 1: Moderate the content BEFORE encryption
      const moderationResult =
        await this.aiModerationService.moderateContent(msg);

      // Step 1.5: Create an AnonymousUser to associate with this confession
      const anonymousUser = manager
        ? await manager
            .getRepository(AnonymousUser)
            .save(manager.getRepository(AnonymousUser).create())
        : await this.anonymousUserService.create();

      // Step 2: Encrypt and save the confession
      const encryptedMsg = encryptConfession(msg, this.aesKey);
      assertEncryptedBeforeSave(encryptedMsg);
      const confessionRepo: Repository<AnonymousConfession> = manager
        ? manager.getRepository(AnonymousConfession)
        : (this.confessionRepo as unknown as Repository<AnonymousConfession>);

      // Prepare Stellar anchoring data if transaction hash provided
      let stellarData: {
        stellarTxHash?: string;
        stellarHash?: string;
        isAnchored?: boolean;
        anchoredAt?: Date;
      } = {};

      if (dto.stellarTxHash) {
        const anchorData = this.stellarService.processAnchorData(
          msg,
          dto.stellarTxHash,
        );
        if (anchorData) {
          stellarData = {
            stellarTxHash: anchorData.stellarTxHash,
            stellarHash: anchorData.stellarHash,
            isAnchored: true,
            anchoredAt: anchorData.anchoredAt,
          };
        }
      }

      const conf = confessionRepo.create({
        message: encryptedMsg,
        keyVersion: 'v1',
        gender: dto.gender,
        anonymousUser,
        moderationScore: moderationResult.score,
        moderationFlags: moderationResult.flags as any,
        moderationStatus: moderationResult.status as any,
        requiresReview: moderationResult.requiresReview,
        isHidden: moderationResult.status === ModerationStatus.REJECTED,
        moderationDetails: moderationResult.details,
        ...stellarData,
        ...(dto.idempotencyKey ? { idempotencyKey: dto.idempotencyKey } : {}),
      });

      const savedConfession = await confessionRepo.save(conf);

      // Step 2.5: Create ConfessionTag entries if tags were provided
      if (validatedTags.length > 0) {
        const confessionTagRepo: Repository<ConfessionTag> = manager
          ? manager.getRepository(ConfessionTag)
          : this.confessionRepo.manager.getRepository(ConfessionTag);

        const confessionTags = validatedTags.map((tag) =>
          confessionTagRepo.create({
            confession: savedConfession,
            tag: tag,
          }),
        );

        await confessionTagRepo.save(confessionTags);
      }

      await this.invalidateConfessionCache();

      // Step 3: Log moderation decision
      await this.moderationRepoService.createLog(
        msg,
        moderationResult,
        savedConfession.id,
        undefined,
        'openai',
        manager,
      );

      // Step 4: Handle high-severity content – only emit once per creation
      if (moderationResult.status === ModerationStatus.REJECTED) {
        this.eventEmitter.emit('moderation.high-severity', {
          confessionId: savedConfession.id,
          score: moderationResult.score,
          flags: moderationResult.flags,
        });
      }

      // Step 5: Handle medium-severity content – only emit once per creation
      if (moderationResult.status === ModerationStatus.FLAGGED) {
        this.eventEmitter.emit('moderation.requires-review', {
          confessionId: savedConfession.id,
          score: moderationResult.score,
          flags: moderationResult.flags,
        });
      }

      return savedConfession;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof ConflictException) throw error;

      if (dto.idempotencyKey && (error as any)?.code === '23505') {
        // The idempotency_key UNIQUE constraint on anonymous_confessions fired
        // while the records table approach was bypassed (legacy path).
        const existing = await this.confessionRepo.findOne({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (existing) {
          const decryptedMessage = decryptConfession(
            existing.message,
            this.aesKey,
          );
          const hasSamePayload =
            msg === decryptedMessage &&
            (dto.gender ?? null) === (existing.gender ?? null) &&
            (dto.stellarTxHash ?? null) === (existing.stellarTxHash ?? null);

          if (hasSamePayload) {
            existing.message = decryptedMessage;
            return existing;
          }

          throw new ConflictException(
            'Idempotency key replay conflict: request body does not match original submission.',
          );
        }
      }

      throw new InternalServerErrorException('Failed to create confession');
    }
  }

  async getConfessions(dto: GetConfessionsDto) {
    const limit = dto.limit ?? 10;
    const sort = dto.sort || SortOrder.NEWEST;

    // Use cursor if provided
    const parsedCursor = decodeCursor<{ id: string; created_at: string }>(
      dto.cursor,
    );

    const cacheKey = this.cacheService.buildKey(
      'confessions',
      dto.cursor || 'no-cursor',
      dto.page || 1,
      limit,
      dto.gender || 'all',
      dto.sort || 'recent',
    );

    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const qb = this.confessionRepo
      .createQueryBuilder('confession')
      .leftJoin('confession.anonymousUser', 'anonymousUser')
      .leftJoin('anonymousUser.userLinks', 'userLinks')
      .leftJoin('userLinks.user', 'user')
      .andWhere('confession.isDeleted = false')
      .andWhere('confession.isHidden = false')
      .andWhere('confession.moderationStatus IN (:...statuses)', {
        statuses: [ModerationStatus.APPROVED, ModerationStatus.PENDING],
      })
      // Public feed / scheduling: never show drafts; only show scheduled
      // posts once their publishAt has passed. (Previously unfiltered —
      // draft/future-scheduled rows could leak into the public feed.)
      .andWhere("confession.status != 'draft'")
      .andWhere(
        "(confession.status != 'scheduled' OR confession.publishAt <= :now)",
        { now: new Date() },
      )
      // Discoverability: exclude confessions whose author has explicitly
      // opted out via privacy_settings.isDiscoverable = false. Rewritten
      // from a MySQL-only JSON_TYPE(...) clause, which threw a Postgres
      // syntax error on every request that joined a linked user row —
      // the actual cause of the generic 500s referenced in this issue.
      .andWhere(
        new Brackets((sub) => {
          sub
            .where('userLinks.id IS NULL')
            .orWhere('user.privacy_settings IS NULL')
            .orWhere(
              "user.privacy_settings->>'isDiscoverable' IS DISTINCT FROM 'false'",
            );
        }),
      )
      .leftJoinAndSelect('confession.reactions', 'reactions')
      .select([
        'confession.id',
        'confession.message',
        'confession.gender',
        'confession.created_at',
        'confession.view_count',
        'confession.isAnchored',
        'confession.stellarTxHash',
        'confession.moderationStatus',
        'reactions.id',
        'reactions.emoji',
        'reactions.createdAt',
      ]);

    if (dto.gender) {
      qb.andWhere('confession.gender = :gender', { gender: dto.gender });
    }

    // Apply cursor or page-based filter
    if (parsedCursor && sort === SortOrder.NEWEST) {
      qb.andWhere(
        '(confession.created_at < :createdAt OR (confession.created_at = :createdAt AND confession.id < :id))',
        { createdAt: parsedCursor.created_at, id: parsedCursor.id },
      );
    } else if (dto.page && dto.page > 1) {
      const skip = (dto.page - 1) * limit;
      qb.skip(skip);
    }

    if (sort === SortOrder.TRENDING) {
      qb.addSelect(
        (sub) =>
          sub
            .select('COUNT(*)')
            .from('reaction', 'r')
            .where('r.confession_id = confession.id'),
        'reaction_count',
      )
        .orderBy('reaction_count', 'DESC')
        .addOrderBy('confession.created_at', 'DESC');
    } else {
      qb.orderBy('confession.created_at', 'DESC').addOrderBy(
        'confession.id',
        'DESC',
      );
    }

    // Fetch one extra to determine if there's more
    const items = await qb.take(limit + 1).getMany();
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;

    const decryptedItems = resultItems.map((item) => {
      const decrypted = {
        ...item,
        message: decryptConfession(item.message, this.aesKey),
      };
      return mapToSlimConfession(decrypted);
    });

    let nextCursor: string | null = null;
    if (hasMore && decryptedItems.length > 0) {
      const lastItem = items[limit - 1];
      nextCursor = encodeCursor({
        id: lastItem.id,
        created_at: lastItem.created_at.toISOString(),
      });
    }

    const response = new CursorPaginatedResponseDto(
      decryptedItems,
      nextCursor,
      hasMore,
      limit,
    );

    await this.cacheService.set(cacheKey, response, CACHE_TTL.CONFESSION_LIST);

    return response;
  }

  async update(id: string, dto: UpdateConfessionDto) {
    const existing = await this.confessionRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!existing) throw new NotFoundException(`Confession ${id} not found`);

    if (dto.message) {
      const sanitized = this.sanitizeMessage(dto.message);
      if (!sanitized) throw new BadRequestException('Invalid content');

      // Re-moderate updated content
      const moderationResult =
        await this.aiModerationService.moderateContent(sanitized);

      dto.message = encryptConfession(sanitized, this.aesKey);
      assertEncryptedBeforeSave(dto.message);
      await this.confessionRepo.update(id, {
        ...dto,
        moderationScore: moderationResult.score,
        moderationFlags: moderationResult.flags as any,
        moderationStatus: moderationResult.status as any,
        requiresReview: moderationResult.requiresReview,
        isHidden: moderationResult.status === ModerationStatus.REJECTED,
        moderationDetails: moderationResult.details,
      });

      // Log the moderation
      await this.moderationRepoService.createLog(
        sanitized,
        moderationResult,
        id,
        undefined,
        'openai',
      );
    } else {
      await this.confessionRepo.update(id, dto);
    }

    const updated = await this.confessionRepo.findOne({ where: { id } });
    if (updated)
      updated.message = decryptConfession(updated.message, this.aesKey);
    return updated;
  }

  async remove(id: string, deletedBy?: string) {
    const existing = await this.confessionRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!existing) throw new NotFoundException(`Confession ${id} not found`);
    await this.confessionRepo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: deletedBy || null,
    });
    return { message: 'Confession soft-deleted', id };
  }

  /**
   * Restore a soft-deleted confession (admin only).
   */
  async restore(id: string) {
    const existing = await this.confessionRepo.findOne({
      where: { id, isDeleted: true },
    });
    if (!existing)
      throw new NotFoundException(`Soft-deleted confession ${id} not found`);
    await this.confessionRepo.update(id, {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    return { message: 'Confession restored', id };
  }

  /**
   * List soft-deleted confessions for admin review.
   */
  async getDeletedConfessions(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.confessionRepo.findAndCount({
      where: { isDeleted: true },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: data.map((c) => ({
        ...c,
        message: decryptConfession(c.message, this.aesKey),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Determine whether this query should be sampled for observability.
   * Uses Math.random() against the configured sample rate so that overhead
   * stays bounded under high traffic.
   */
  private shouldSampleSearch(): boolean {
    const rate = this.configService.get<number>('app.searchSampleRate', 0.1);
    return Math.random() < rate;
  }

  /**
   * Emit observability signals after a search call completes.
   * Always warns on slow queries; emits a sampled info log otherwise.
   */
  private emitSearchObservability(opts: {
    durationMs: number;
    rawTerm: string;
    searchType: 'fulltext' | 'hybrid' | 'ilike';
    page: number;
    limit: number;
    resultCount: number;
    sampled: boolean;
  }): void {
    const thresholdMs = this.configService.get<number>(
      'app.searchSlowQueryThresholdMs',
      500,
    );

    this.logger.observeTimer('search.duration_ms', opts.durationMs, {
      searchType: opts.searchType,
    });

    if (opts.durationMs >= thresholdMs) {
      this.logger.logSlowSearch({
        durationMs: opts.durationMs,
        rawTerm: opts.rawTerm,
        searchType: opts.searchType,
        page: opts.page,
        limit: opts.limit,
        resultCount: opts.resultCount,
        thresholdMs,
      });
      return;
    }

    if (opts.sampled) {
      this.logger.logSampledSearch({
        durationMs: opts.durationMs,
        rawTerm: opts.rawTerm,
        searchType: opts.searchType,
        page: opts.page,
        limit: opts.limit,
        resultCount: opts.resultCount,
      });
    }
  }

  async search(dto: SearchConfessionDto) {
    if (!dto.q.trim())
      throw new BadRequestException('Search term cannot be empty');
    const limit =
      typeof dto.limit === 'number' ? dto.limit : Number(dto.limit) || 10;
    const sampled = this.shouldSampleSearch();
    const t0 = Date.now();
    const result = await this.confessionRepo.hybridSearch(
      dto.q.trim(),
      dto.page,
      limit,
      dto,
    );
    const durationMs = Date.now() - t0;
    const resultCount = result?.confessions?.length ?? 0;

    this.emitSearchObservability({
      durationMs,
      rawTerm: dto.q,
      searchType: 'hybrid',
      page: dto.page ?? 1,
      limit,
      resultCount,
      sampled,
    });

    const mappedConfessions = (result?.confessions || []).map((item) => {
      const decrypted = {
        ...item,
        message: decryptConfession(item.message, this.aesKey),
      };
      return mapToSlimConfession(decrypted);
    });

    return {
      data: mappedConfessions,
      meta: {
        total: result?.total || 0,
        page: dto.page,
        limit,
        totalPages: Math.ceil((result?.total || 0) / limit),
        searchTerm: dto.q.trim(),
      },
    };
  }

  async fullTextSearch(dto: SearchConfessionDto) {
    if (!dto.q.trim())
      throw new BadRequestException('Search term cannot be empty');
    const limit =
      typeof dto.limit === 'number' ? dto.limit : Number(dto.limit) || 10;
    const sampled = this.shouldSampleSearch();
    const t0 = Date.now();
    const result = await this.confessionRepo.fullTextSearch(
      dto.q.trim(),
      dto.page,
      limit,
      dto,
    );
    const durationMs = Date.now() - t0;
    const resultCount = result?.confessions?.length ?? 0;

    this.emitSearchObservability({
      durationMs,
      rawTerm: dto.q,
      searchType: 'fulltext',
      page: dto.page ?? 1,
      limit,
      resultCount,
      sampled,
    });

    const mappedConfessions = (result?.confessions || []).map((item) => {
      const decrypted = {
        ...item,
        message: decryptConfession(item.message, this.aesKey),
      };
      return mapToSlimConfession(decrypted);
    });

    return {
      data: mappedConfessions,
      meta: {
        total: result?.total || 0,
        page: dto.page,
        limit,
        totalPages: Math.ceil((result?.total || 0) / limit),
        searchTerm: dto.q.trim(),
        searchType: 'fulltext',
      },
    };
  }

  async getConfessionByIdWithViewCount(id: string, req: Request) {
    const singleCacheKey = this.cacheService.buildKey('confession', id);

    const cached = await this.cacheService.get<any>(singleCacheKey);
    if (cached) {
      return cached;
    }

    const conf = await this.confessionRepo.findOne({
      where: { id, isDeleted: false, isHidden: false },
      relations: [
        'anonymousUser',
        'anonymousUser.userLinks',
        'anonymousUser.userLinks.user',
        'reactions',
        'reactions.anonymousUser',
      ],
      select: {
        id: true,
        message: true,
        gender: true,
        created_at: true,
        view_count: true,
        moderationStatus: true,
        reactions: {
          id: true,
          emoji: true,
          createdAt: true,
          anonymousUser: {
            id: true,
          },
        },
      },
    });
    if (!conf) throw new NotFoundException('Confession not found');

    const authorUser = conf.anonymousUser?.userLinks?.[0]?.user;
    const hideReactions = authorUser && !authorUser.shouldShowReactions();
    if (hideReactions) {
      conf.reactions = [];
    }

    type AuthenticatedRequest = Request & { user?: { id?: string } };
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    let userOrIp: string =
      userId ?? String(req.headers['x-forwarded-for'] ?? req.ip);
    if (Array.isArray(userOrIp)) {
      userOrIp = userOrIp[0] ?? req.ip;
    }
    if (!userOrIp) userOrIp = req.ip ?? '';

    if (await this.viewCache.checkAndMarkView(id, userOrIp)) {
      await this.confessionRepo.incrementViewCountAtomically(id);
      const updated = await this.confessionRepo.findOne({
        where: { id },
        relations: [
          'anonymousUser',
          'anonymousUser.userLinks',
          'anonymousUser.userLinks.user',
          'reactions',
          'reactions.anonymousUser',
        ],
      });
      if (updated) {
        const updatedAuthor = updated.anonymousUser?.userLinks?.[0]?.user;
        if (updatedAuthor && !updatedAuthor.shouldShowReactions()) {
          updated.reactions = [];
        }
        updated.message = decryptConfession(updated.message, this.aesKey);
      }
      await this.cacheService.set(
        singleCacheKey,
        updated,
        CACHE_TTL.CONFESSION_SINGLE,
      );
      return updated;
    }

    conf.message = decryptConfession(conf.message, this.aesKey);
    await this.cacheService.set(
      singleCacheKey,
      conf,
      CACHE_TTL.CONFESSION_SINGLE,
    );
    return conf;
  }

  async getTrendingConfessions(window: string = '24h') {
    let days: number;
    switch (window) {
      case '7d':
        days = TrendingWindow.WEEK;
        break;
      case '30d':
        days = TrendingWindow.MONTH;
        break;
      case 'all':
        days = 365 * 10;
        break;
      default:
        days = TrendingWindow.DAY;
    }

    const { startAt, endAt } = toWindowBoundaries(days);
    const rawConfs = await this.confessionRepo.findTrending(20, startAt, endAt);

    // Apply anomaly/bot detection adjustment to reduce bot-inflated scores
    const confs = rawConfs as any[];
    const adjusted = await Promise.all(
      confs.map(async (item) => {
        const adjustment = await this.anomalyDetection.getAdjustmentFactor(
          item.id,
        );
        return { item, adjustment };
      }),
    );

    // Sort by adjusted score: raw trending_score * anomaly adjustment
    adjusted.sort((a, b) => {
      const scoreA = Number(a.item.trending_score) || 0;
      const scoreB = Number(b.item.trending_score) || 0;
      return scoreB * b.adjustment - scoreA * a.adjustment;
    });

    const mapped = adjusted.map(({ item }) => {
      const decrypted = {
        ...item,
        message: decryptConfession(item.message, this.aesKey),
      };
      return mapToSlimConfession(decrypted);
    });

    return { data: mapped, window };
  }

  async updateModerationStatus(
    confessionId: string,
    status: ModerationStatus,
    moderatorId: string,
    notes?: string,
  ) {
    const confession = await this.confessionRepo.findOne({
      where: { id: confessionId },
    });

    if (!confession) {
      throw new NotFoundException('Confession not found');
    }

    confession.moderationStatus = status as any;
    confession.isHidden = status === ModerationStatus.REJECTED;
    confession.requiresReview = false;

    const updated = await this.confessionRepo.save(confession);

    const logs =
      await this.moderationRepoService.getLogsByConfession(confessionId);
    if (logs.length > 0) {
      await this.moderationRepoService.updateReview(
        logs[0].id,
        status,
        moderatorId,
        notes,
      );
    }

    return updated;
  }

  async getFlaggedConfessions(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.confessionRepo.findAndCount({
      where: [
        { requiresReview: true, isDeleted: false },
        { moderationStatus: ModerationStatus.FLAGGED as any, isDeleted: false },
      ],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async createConfession(userId: string, data: any) {
    // Option 1: Use the logger's built-in method
    this.logger.logWithUser(
      'Creating confession',
      userId,
      'ConfessionsService',
    );

    try {
      // Your logic here
      const confession = await this.saveConfession(data);

      this.logger.logWithUser(
        'Confession created successfully',
        userId,
        'ConfessionsService',
      );

      return confession;
    } catch (error: any) {
      // Option 2: Use maskUserId helper for custom messages
      this.logger.error(
        `Failed to create confession for ${maskUserId(userId)}: ${error.message}`,
        error.stack,
        'ConfessionsService',
      );
      throw error;
    }
  }

  async getUserConfessions(userId: number, dto: GetUserConfessionsDto) {
    this.logger.log(
      {
        action: 'fetch_user_confessions',
        userId: maskUserId(userId.toString()),
      },
      'ConfessionsService',
    );

    const anonIds = await this.anonymousUserService.getAnonIdsForUser(userId);

    if (anonIds.length === 0) {
      return new CursorPaginatedResponseDto([], null, false, dto.limit || 10);
    }

    const limit = dto.limit ?? 10;
    const sort = dto.sort || SortOrder.NEWEST;

    const queryBuilder = this.confessionRepo
      .createQueryBuilder('confession')
      .where('confession.anonymousUserId IN (:...anonIds)', { anonIds })
      .andWhere('confession.isDeleted = false');

    if (dto.gender) {
      queryBuilder.andWhere('confession.gender = :gender', {
        gender: dto.gender,
      });
    }

    if (dto.status) {
      queryBuilder.andWhere('confession.moderationStatus = :status', {
        status: dto.status,
      });
    }

    // Apply cursor pagination
    if (dto.cursor && sort === SortOrder.NEWEST) {
      const parsedCursor = decodeCursor<{ id: string; created_at: string }>(
        dto.cursor,
      );
      if (parsedCursor) {
        queryBuilder.andWhere(
          '(confession.created_at < :createdAt OR (confession.created_at = :createdAt AND confession.id < :id))',
          { createdAt: parsedCursor.created_at, id: parsedCursor.id },
        );
      }
    } else if (dto.page && dto.page > 1) {
      const skip = (dto.page - 1) * limit;
      queryBuilder.skip(skip);
    }

    if (sort === SortOrder.TRENDING) {
      queryBuilder
        .addSelect(
          (sub) =>
            sub
              .select('COUNT(*)')
              .from('reaction', 'r')
              .where('r.confession_id = confession.id'),
          'reaction_count',
        )
        .orderBy('reaction_count', 'DESC')
        .addOrderBy('confession.created_at', 'DESC');
    } else {
      queryBuilder
        .orderBy('confession.created_at', 'DESC')
        .addOrderBy('confession.id', 'DESC');
    }

    const items = await queryBuilder.take(limit + 1).getMany();
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;

    const decryptedItems = resultItems.map((item) => ({
      ...item,
      message: decryptConfession(item.message, this.aesKey),
    }));

    let nextCursor: string | null = null;
    if (hasMore && decryptedItems.length > 0) {
      const lastItem = items[limit - 1];
      nextCursor = encodeCursor({
        id: lastItem.id,
        created_at: lastItem.created_at.toISOString(),
      });
    }

    return new CursorPaginatedResponseDto(
      decryptedItems,
      nextCursor,
      hasMore,
      limit,
    );
  }

  // Private methods (examples)
  private async saveConfession(data: any) {
    // Implementation
    return data;
  }

  private async findByUser(_userId: string) {
    // Legacy method - redirecting to the new implementation
    // Note: This matches the old signature but doesn't support pagination/filtering.
    // It's better to use getUserConfessions directly.
    return [];
  }

  async findAll(): Promise<ConfessionResponseDto[]> {
    try {
      const confessions = await this.confessionRepo.find({
        where: { isDeleted: false },
        order: { created_at: 'DESC' },
      });

      // Decrypt all confessions and convert to DTO
      return confessions.map((confession) => this.toResponseDto(confession));
    } catch (error: any) {
      this.logger.error(
        'Failed to fetch confessions',
        error.stack,
        'ConfessionsService',
      );
      throw error;
    }
  }

  async findOne(id: string): Promise<ConfessionResponseDto> {
    try {
      const confession = await this.confessionRepo.findOne({
        where: { id, isDeleted: false },
      });

      if (!confession) {
        throw new NotFoundException(`Confession with ID ${id} not found`);
      }

      return this.toResponseDto(confession);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        'Failed to fetch confession',
        error.stack,
        'ConfessionsService',
      );
      throw error;
    }
  }

  /**
   * Anchor an existing confession on Stellar blockchain
   */
  async anchorConfession(id: string, dto: AnchorConfessionDto) {
    const confession = await this.confessionRepo.findOne({
      where: { id, isDeleted: false },
    });

    if (!confession) {
      throw new NotFoundException(`Confession ${id} not found`);
    }

    if (confession.isAnchored) {
      throw new BadRequestException(
        'Confession is already anchored on Stellar',
      );
    }

    // A stellarTxHash without isAnchored means a prior submission is pending
    // on-chain. If the same tx hash is provided, return the existing pending
    // state (idempotent replay). If a different tx hash is provided, allow
    // the update to enable safe retry after a stale/failed anchor.
    if (confession.stellarTxHash && !confession.isAnchored) {
      if (confession.stellarTxHash === dto.stellarTxHash) {
        this.logger.log({
          event: 'anchor_replay',
          confessionId: confession.id,
          stellarTxHash: confession.stellarTxHash,
        });

        return {
          confessionId: confession.id,
          stellarTxHash: confession.stellarTxHash,
          stellarHash: confession.stellarHash,
          isAnchored: false,
          anchorPending: true,
          message:
            'An anchor submission is already pending for this confession. Wait for it to confirm or fail before retrying.',
          stellarExplorerUrl: this.stellarService.getExplorerUrl(
            confession.stellarTxHash,
          ),
        };
      }

      // Different tx hash provided — this is a retry. Log and continue.
      this.logger.log({
        event: 'anchor_retry_replace',
        confessionId: confession.id,
        previousTxHash: confession.stellarTxHash,
        newTxHash: dto.stellarTxHash,
      });
    }

    if (!this.stellarService.isValidTxHash(dto.stellarTxHash)) {
      throw new BadRequestException('Invalid Stellar transaction hash format');
    }

    // Decrypt confession to generate hash
    const decryptedMessage = decryptConfession(confession.message, this.aesKey);
    const anchorData = this.stellarService.processAnchorData(
      decryptedMessage,
      dto.stellarTxHash,
    );

    if (!anchorData) {
      throw new BadRequestException('Failed to process anchoring data');
    }

    // Persist as pending: the transaction hash is recorded but isAnchored stays
    // false until verifyStellarAnchor confirms the chain result.
    try {
      await this.confessionRepo.update(id, {
        stellarTxHash: anchorData.stellarTxHash,
        stellarHash: anchorData.stellarHash,
      });
    } catch (error) {
      if ((error as any)?.code === '23505') {
        throw new ConflictException(
          'Duplicate Stellar transaction hash detected for this confession.',
        );
      }
      throw error;
    }

    await this.cacheService.del(this.cacheService.buildKey('confession', id));

    const updated = await this.confessionRepo.findOne({ where: { id } });
    if (updated) {
      updated.message = decryptConfession(updated.message, this.aesKey);
    }

    return {
      ...updated,
      anchorPending: true,
      stellarExplorerUrl: this.stellarService.getExplorerUrl(dto.stellarTxHash),
    };
  }

  /**
   * Verify if a confession is anchored on Stellar
   */
  async verifyStellarAnchor(id: string) {
    const confession = await this.confessionRepo.findOne({
      where: { id, isDeleted: false },
    });

    if (!confession) {
      throw new NotFoundException(`Confession ${id} not found`);
    }

    // Not yet submitted to Stellar at all
    if (!confession.stellarTxHash) {
      return {
        isAnchored: false,
        anchorPending: false,
        message: 'Confession is not anchored on Stellar',
      };
    }

    const txSucceeded = await this.stellarService.verifyTransaction(
      confession.stellarTxHash,
    );

    // A successful transaction alone does not prove *this* confession was
    // anchored — the reported tx hash could belong to an unrelated or stale
    // submission. Confirm the contract's on-chain state actually holds the
    // locally-computed hash before trusting the anchor.
    const payloadMatches =
      txSucceeded &&
      !!confession.stellarHash &&
      (await this.contractService.verifyConfession(confession.stellarHash)) !==
        null;

    if (txSucceeded && !payloadMatches) {
      this.logger.warn(
        `Anchor hash mismatch for confession ${confession.id}: transaction ${confession.stellarTxHash} succeeded on-chain but does not anchor the expected confession hash`,
      );
    }

    const isVerified = payloadMatches;

    // Pending anchor confirmed on-chain: promote to fully anchored
    if (!confession.isAnchored && isVerified) {
      const now = new Date();
      await this.confessionRepo.update(confession.id, {
        isAnchored: true,
        anchoredAt: now,
      });
      confession.isAnchored = true;
      confession.anchoredAt = now;
      await this.cacheService.del(this.cacheService.buildKey('confession', id));
    }

    return {
      isAnchored: confession.isAnchored,
      anchorPending: !confession.isAnchored,
      isVerified,
      stellarTxHash: confession.stellarTxHash,
      stellarHash: confession.stellarHash,
      anchoredAt: confession.anchoredAt,
      stellarExplorerUrl: this.stellarService.getExplorerUrl(
        confession.stellarTxHash,
      ),
    };
  }

  private toResponseDto(
    confession: AnonymousConfession,
  ): ConfessionResponseDto {
    const decryptedMessage = decryptConfession(confession.message, this.aesKey);

    return new ConfessionResponseDto({
      id: String(confession.id),
      message: String(decryptedMessage),
      createdAt: confession.created_at,
      updatedAt: confession.created_at,
    });
  }

  private async invalidateConfessionCache() {
    await this.cacheService.delPattern('confessions:');
  }

  /**
   * Get confessions filtered by tag with pagination
   */
  /**
   * Get confessions filtered by tag with pagination
   */
  async getConfessionsByTag(tagName: string, dto: GetConfessionsByTagDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;

    if (limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be 1–100');
    }

    // Validate that the tag exists
    const tag = await this.tagService.getTagByName(tagName);
    if (!tag) {
      throw new NotFoundException(`Tag '${tagName}' not found`);
    }

    const cursor = dto.cursor;
    const cacheKey = this.cacheService.buildKey(
      'confessions',
      'tag',
      tagName,
      cursor || `page_${page}`,
      limit,
      dto.sort || 'newest',
    );

    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const { confessions, nextCursor, hasMore } =
      await this.confessionRepo.findByTag(tagName, page, limit, cursor);

    const decryptedItems = confessions.map((item) => {
      const decrypted = {
        ...item,
        message: decryptConfession(item.message, this.aesKey),
      };
      return mapToSlimConfession(decrypted);
    });

    const result = new CursorPaginatedResponseDto(
      decryptedItems,
      nextCursor || null,
      hasMore,
      limit,
    );

    await this.cacheService.set(cacheKey, result, CACHE_TTL.CONFESSION_LIST);

    return result;
  }

  /**
   * Get all available tags
   */
  async getAllTags() {
    return this.tagService.getAllTags();
  }
}
