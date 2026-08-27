import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  LessThan,
  LessThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import {
  ConfessionDraft,
  ConfessionDraftStatus,
} from './entities/confession-draft.entity';
import {
  encryptConfession,
  decryptConfession,
} from '../utils/confession-encryption';
import { ConfessionService } from '../confession/confession.service';
import { UpdateConfessionDraftDto } from './dto/update-confession-draft.dto';
import { DateTime } from 'luxon';

const MAX_DRAFTS_PER_USER = 10;
const MAX_PUBLISH_ATTEMPTS = 5;

@Injectable()
export class ConfessionDraftService {
  constructor(
    @InjectRepository(ConfessionDraft)
    private readonly draftRepo: Repository<ConfessionDraft>,
    private readonly confessionService: ConfessionService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  private get aesKey(): string {
    return this.configService.get<string>('app.confessionAesKey', '');
  }

  private toUtcDate(scheduledFor: string, timezone?: string): Date {
    const trimmed = scheduledFor.trim();
    if (!trimmed) throw new BadRequestException('scheduledFor is required');

    if (timezone) {
      const dt = DateTime.fromISO(trimmed, { zone: timezone });
      if (!dt.isValid)
        throw new BadRequestException('Invalid scheduledFor/timezone');
      return dt.toUTC().toJSDate();
    }

    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime()))
      throw new BadRequestException('Invalid scheduledFor');
    return d;
  }

  private sanitizeForResponse(draft: ConfessionDraft) {
    return {
      ...draft,
      content: decryptConfession(draft.content, this.aesKey),
      revisions: (draft.revisions || []).map((rev) => ({
        ...rev,
        content: decryptConfession(rev.content, this.aesKey),
      })),
    };
  }

  async createDraft(
    userId: number,
    content: string,
    category?: string,
    scheduledFor?: string,
    timezone?: string,
  ) {
    const existingCount = await this.draftRepo.count({ where: { userId } });
    if (existingCount >= MAX_DRAFTS_PER_USER) {
      throw new BadRequestException(
        `Draft limit reached (max ${MAX_DRAFTS_PER_USER})`,
      );
    }

    const encrypted = encryptConfession(content, this.aesKey);

    let scheduledForUtc: Date | null = null;
    let status = ConfessionDraftStatus.DRAFT;
    if (scheduledFor) {
      scheduledForUtc = this.toUtcDate(scheduledFor, timezone);
      if (scheduledForUtc.getTime() <= Date.now()) {
        throw new BadRequestException('scheduledFor must be in the future');
      }
      status = ConfessionDraftStatus.SCHEDULED;
    }

    const draft = this.draftRepo.create({
      userId,
      content: encrypted,
      category: category ?? null,
      scheduledFor: scheduledForUtc,
      timezone: timezone ?? null,
      status,
    });

    const saved = await this.draftRepo.save(draft);
    return this.sanitizeForResponse(saved);
  }

  async listDrafts(userId: number) {
    const drafts = await this.draftRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
    return drafts.map((d) => this.sanitizeForResponse(d));
  }

  async getDraft(userId: number, id: string) {
    const draft = await this.draftRepo.findOne({ where: { id } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.userId !== userId) throw new ForbiddenException();
    return this.sanitizeForResponse(draft);
  }

  async updateDraft(userId: number, id: string, dto: UpdateConfessionDraftDto) {
    const draft = await this.draftRepo.findOne({ where: { id } });
    if (!draft) {
      // A versioned update targets a specific remote revision the client
      // previously synced. If that draft no longer exists, this is an
      // offline-sync conflict (deleted elsewhere while the client was
      // offline), not a generic "unknown id" 404 — the caller still holds
      // recoverable local content and must be told the remote copy is gone.
      if (dto.version !== undefined) {
        throw new ConflictException({
          reason: 'remote_deleted',
          message: 'The draft was deleted remotely while you were offline.',
          draftId: id,
        });
      }
      throw new NotFoundException('Draft not found');
    }
    if (draft.userId !== userId) throw new ForbiddenException();

    if (draft.status === ConfessionDraftStatus.POSTED) {
      throw new BadRequestException('Cannot edit a posted draft');
    }

    if (dto.version !== undefined && draft.version !== dto.version) {
      throw new ConflictException({
        reason: 'remote_updated',
        message:
          'Conflict detected: draft has been modified by another session',
        currentVersion: draft.version,
        currentDraft: this.sanitizeForResponse(draft),
      });
    }

    if (typeof dto.content === 'string') {
      // Store current content in revision history before updating
      const revision = {
        content: draft.content,
        version: draft.version,
        createdAt: new Date(),
      };

      draft.revisions = [revision, ...(draft.revisions || [])].slice(0, 10);
      draft.content = encryptConfession(dto.content, this.aesKey);
    }

    if (dto.category !== undefined) {
      draft.category = dto.category || null;
    }

    const saved = await this.draftRepo.save(draft);
    return this.sanitizeForResponse(saved);
  }

  async autoSaveDraft(
    userId: number,
    dto: UpdateConfessionDraftDto & { id?: string },
  ) {
    if (dto.id) {
      return this.updateDraft(userId, dto.id, dto);
    }

    if (!dto.content?.trim()) {
      throw new BadRequestException('content is required');
    }

    return this.createDraft(userId, dto.content, dto.category);
  }

  async deleteDraft(userId: number, id: string) {
    const draft = await this.draftRepo.findOne({ where: { id } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.userId !== userId) throw new ForbiddenException();
    await this.draftRepo.remove(draft);
    return { message: 'Draft deleted' };
  }

  async deleteAllDrafts(userId: number) {
    const drafts = await this.draftRepo.find({ where: { userId } });
    await Promise.all(drafts.map((draft) => this.draftRepo.remove(draft)));
    return { message: 'Drafts deleted' };
  }

  async scheduleDraft(
    userId: number,
    id: string,
    scheduledFor: string,
    timezone?: string,
  ) {
    const draft = await this.draftRepo.findOne({ where: { id } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.userId !== userId) throw new ForbiddenException();

    if (draft.status === ConfessionDraftStatus.POSTED) {
      throw new BadRequestException('Cannot schedule a posted draft');
    }

    const scheduledUtc = this.toUtcDate(scheduledFor, timezone);
    if (scheduledUtc.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledFor must be in the future');
    }

    draft.scheduledFor = scheduledUtc;
    draft.timezone = timezone ?? draft.timezone;
    draft.status = ConfessionDraftStatus.SCHEDULED;

    const saved = await this.draftRepo.save(draft);
    return this.sanitizeForResponse(saved);
  }

  async cancelSchedule(userId: number, id: string) {
    const draft = await this.draftRepo.findOne({ where: { id } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.userId !== userId) throw new ForbiddenException();

    if (draft.status !== ConfessionDraftStatus.SCHEDULED) {
      throw new BadRequestException('Draft is not scheduled');
    }

    draft.scheduledFor = null;
    draft.status = ConfessionDraftStatus.DRAFT;

    const saved = await this.draftRepo.save(draft);
    return this.sanitizeForResponse(saved);
  }

  async publishNow(userId: number, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ConfessionDraft);
      const draft = await repo.findOne({ where: { id } });
      if (!draft) throw new NotFoundException('Draft not found');
      if (draft.userId !== userId) throw new ForbiddenException();

      if (draft.status === ConfessionDraftStatus.POSTED) {
        throw new BadRequestException('Draft already posted');
      }

      const message = decryptConfession(draft.content, this.aesKey);
      const confession = await this.confessionService.create(
        { message } as any,
        manager,
      );

      draft.status = ConfessionDraftStatus.POSTED;
      draft.scheduledFor = null;
      draft.publishAttempts = 0;
      draft.lastPublishError = null;
      const savedDraft = await repo.save(draft);

      return { confession, draft: this.sanitizeForResponse(savedDraft) };
    });
  }

  async convertPostedToDraft(userId: number, id: string) {
    const draft = await this.draftRepo.findOne({ where: { id } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.userId !== userId) throw new ForbiddenException();

    if (draft.status !== ConfessionDraftStatus.POSTED) {
      throw new BadRequestException('Only posted drafts can be converted');
    }

    const existingCount = await this.draftRepo.count({ where: { userId } });
    if (existingCount >= MAX_DRAFTS_PER_USER) {
      throw new BadRequestException(
        `Draft limit reached (max ${MAX_DRAFTS_PER_USER})`,
      );
    }

    draft.status = ConfessionDraftStatus.DRAFT;
    draft.scheduledFor = null;
    draft.lastPublishError = null;
    draft.publishAttempts = 0;

    const saved = await this.draftRepo.save(draft);
    return this.sanitizeForResponse(saved);
  }

  async enqueueDueDraftIds(): Promise<string[]> {
    const due = await this.draftRepo.find({
      where: {
        status: ConfessionDraftStatus.SCHEDULED,
        scheduledFor: LessThanOrEqual(new Date()),
        publishAttempts: LessThan(MAX_PUBLISH_ATTEMPTS),
      },
      order: { scheduledFor: 'ASC' },
      take: 200,
    });

    return due.map((d) => d.id);
  }

  async publishScheduledDraftById(draftId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ConfessionDraft);

      const draft = await repo
        .createQueryBuilder('draft')
        .setLock('pessimistic_write')
        .where('draft.id = :id', { id: draftId })
        .getOne();

      if (!draft) return;

      if (draft.status !== ConfessionDraftStatus.SCHEDULED) return;
      if (!draft.scheduledFor) return;
      if (draft.scheduledFor.getTime() > Date.now()) return;

      if (draft.publishAttempts >= MAX_PUBLISH_ATTEMPTS) return;

      try {
        const message = decryptConfession(draft.content, this.aesKey);
        await this.confessionService.create({ message } as any, manager);

        draft.status = ConfessionDraftStatus.POSTED;
        draft.scheduledFor = null;
        draft.lastPublishError = null;
        draft.publishAttempts = 0;
        await repo.save(draft);
      } catch (e) {
        draft.publishAttempts = (draft.publishAttempts ?? 0) + 1;
        draft.lastPublishError =
          e instanceof Error ? e.message : 'Unknown error';
        await repo.save(draft);
        throw e;
      }
    });
  }
}
