import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Report, ReportStatus, ReportType } from '../entities/report.entity'
import { AnonymousConfession } from '../../confession/entities/confession.entity';
import { User, UserRole } from '../../user/entities/user.entity';
import { ModerationService } from './moderation.service';
import { ModerationTemplateService } from '../../comment/moderation-template.service';
import { AuditActionType } from '../../audit-log/audit-log.entity';
import { Request } from 'express';
import { decryptConfession } from '../../utils/confession-encryption';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserAnonymousUser } from '../../user/entities/user-anonymous-link.entity';
import { ConfigService } from '@nestjs/config';
import { Tip } from '../../tipping/entities/tip.entity';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { JobManagementService } from '../../notifications/services/job-management.service';

export interface BulkResolveOutcome {
  id: string;
  outcome: 'resolved' | 'skipped' | 'not_found';
  previousStatus?: ReportStatus;
}

export interface BulkResolveResult {
  requested: number;
  resolved: number;
  skipped: number;
  notFound: number;
  outcomes: BulkResolveOutcome[];
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  private safeDecryptConfessionMessage(message: string): string {
    try {
      return decryptConfession(message, this.aesKey);
    } catch (e) {
      this.logger.warn(
        `Failed to decrypt confession message (returning raw). Reason: ${
          e instanceof Error ? e.message : 'unknown'
        }`,
      );
      return message;
    }
  }

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepository: Repository<AnonymousConfession>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAnonymousUser)
    private readonly userAnonRepository: Repository<UserAnonymousUser>,
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    private readonly moderationService: ModerationService,
    private readonly moderationTemplateService: ModerationTemplateService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditLogService: AuditLogService,
    private readonly jobManagementService: JobManagementService,
  ) {}

  private get aesKey(): string {
    return this.configService.get<string>('app.confessionAesKey', '');
  }

  private async runInModerationTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.reportRepository.manager.transaction(work);
  }

  // Reports
  async getReports(
    status?: ReportStatus,
    type?: ReportType,
    startDate?: Date,
    endDate?: Date,
    limit = 50,
    offset = 0,
  ) {
    const query = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.confession', 'confession')
      .leftJoinAndSelect('report.reporter', 'reporter')
      .leftJoinAndSelect('report.resolver', 'resolver')
      .orderBy('report.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (status) {
      query.andWhere('report.status = :status', { status });
    }

    if (type) {
      query.andWhere('report.type = :type', { type });
    }

    if (startDate) {
      query.andWhere('report.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('report.createdAt <= :endDate', { endDate });
    }

    const [reports, total] = await query.getManyAndCount();
    const mapped = reports.map((r) => {
      if (r.confession?.message) {
        r.confession.message = this.safeDecryptConfessionMessage(
          r.confession.message,
        );
      }
      return r;
    });
    return [mapped, total] as const;
  }

  async getReportById(id: string): Promise<Report> {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: ['confession', 'reporter', 'resolver'],
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.confession?.message) {
      report.confession.message = this.safeDecryptConfessionMessage(
        report.confession.message,
      );
    }
    return report;
  }

  async resolveReport(
    id: string,
    adminId: number,
    resolutionNotes: string | null,
    templateId?: number | null,
    request?: Request,
  ): Promise<Report> {
    const templateUsed = templateId
      ? await this.moderationTemplateService
          .findById(templateId)
          .catch(() => null)
      : null;

    const saved = await this.runInModerationTransaction(async (manager) => {
      const reportRepo = manager.getRepository(Report);
      const report = await reportRepo.findOne({ where: { id } });

      if (!report) {
        throw new NotFoundException('Report not found');
      }

      if (report.status === ReportStatus.RESOLVED) {
        throw new BadRequestException('Report already resolved');
      }

      report.status = ReportStatus.RESOLVED;
      report.resolvedBy = adminId;
      report.resolvedAt = new Date();
      report.resolutionNotes = resolutionNotes;
      report.templateId = templateId ?? null;

      const updated = await reportRepo.save(report);

      await this.moderationService.logAction(
        adminId,
        AuditActionType.REPORT_RESOLVED,
        'report',
        id,
        {
          reportType: report.type,
          confessionId: report.confessionId,
          templateId,
          templateName: templateUsed?.name ?? null,
        },
        resolutionNotes,
        request,
        manager,
      );

      return updated;
    });

    this.eventEmitter.emit('report.updated', saved);

    return saved;
  }

  async dismissReport(
    id: string,
    adminId: number,
    notes: string | null,
    request?: Request,
  ): Promise<Report> {
    const saved = await this.runInModerationTransaction(async (manager) => {
      const reportRepo = manager.getRepository(Report);
      const report = await reportRepo.findOne({ where: { id } });

      if (!report) {
        throw new NotFoundException('Report not found');
      }

      if (report.status === ReportStatus.DISMISSED) {
        throw new BadRequestException('Report already dismissed');
      }

      report.status = ReportStatus.DISMISSED;
      report.resolvedBy = adminId;
      report.resolvedAt = new Date();
      report.resolutionNotes = notes;

      const updated = await reportRepo.save(report);

      await this.moderationService.logAction(
        adminId,
        AuditActionType.REPORT_DISMISSED,
        'report',
        id,
        { reportType: report.type },
        notes,
        request,
        manager,
      );

      return updated;
    });

    this.eventEmitter.emit('report.updated', saved);

    return saved;
  }

  async bulkResolveReports(
    ids: string[],
    adminId: number,
    notes: string | null,
    request?: Request,
  ): Promise<BulkResolveResult> {
    const result = await this.runInModerationTransaction(async (manager) => {
      const reportRepo = manager.getRepository(Report);

      // Fetch all requested reports in one query (any status)
      const found = await reportRepo.find({
        where: { id: In(ids) },
      });

      const foundById = new Map(found.map((r) => [r.id, r]));

      const outcomes: BulkResolveOutcome[] = [];
      const toSave: Report[] = [];
      const now = new Date();

      for (const id of ids) {
        const report = foundById.get(id);

        if (!report) {
          outcomes.push({ id, outcome: 'not_found' });
          continue;
        }

        if (report.status !== ReportStatus.PENDING) {
          outcomes.push({
            id,
            outcome: 'skipped',
            previousStatus: report.status,
          });
          continue;
        }

        const before = report.status;
        report.status = ReportStatus.RESOLVED;
        report.resolvedBy = adminId;
        report.resolvedAt = now;
        report.resolutionNotes = notes;
        toSave.push(report);
        outcomes.push({ id, outcome: 'resolved', previousStatus: before });
      }

      if (toSave.length > 0) {
        await reportRepo.save(toSave);
      }

      // Write one audit entry per touched report so every ID is individually
      // attributable in the audit trail.
      for (const item of outcomes) {
        await this.moderationService.logAction(
          adminId,
          AuditActionType.BULK_ACTION,
          'report',
          item.id,
          {
            action: 'bulk_resolve',
            outcome: item.outcome,
            previousStatus: item.previousStatus ?? null,
            resolvedAt: item.outcome === 'resolved' ? now.toISOString() : null,
          },
          notes,
          request,
          manager,
        );
      }

      return {
        toPublish: toSave,
        summary: {
          requested: ids.length,
          resolved: outcomes.filter((o) => o.outcome === 'resolved').length,
          skipped: outcomes.filter((o) => o.outcome === 'skipped').length,
          notFound: outcomes.filter((o) => o.outcome === 'not_found').length,
          outcomes,
        },
      };
    });

    if (result.toPublish.length > 0) {
      this.eventEmitter.emit('reports.bulk.updated', result.toPublish);
    }

    return result.summary;
  }

  // Confessions
  async deleteConfession(
    id: string,
    adminId: number,
    reason: string | null,
    request?: Request,
  ): Promise<void> {
    await this.runInModerationTransaction(async (manager) => {
      const confessionRepo = manager.getRepository(AnonymousConfession);
      const confession = await confessionRepo.findOne({
        where: { id },
      });

      if (!confession) {
        throw new NotFoundException('Confession not found');
      }

      confession.isDeleted = true;
      await confessionRepo.save(confession);

      await this.moderationService.logAction(
        adminId,
        AuditActionType.CONFESSION_DELETED,
        'confession',
        id,
        { reason },
        reason,
        request,
        manager,
      );
    });
  }

  async hideConfession(
    id: string,
    adminId: number,
    reason: string | null,
    request?: Request,
  ): Promise<AnonymousConfession> {
    return this.runInModerationTransaction(async (manager) => {
      const confessionRepo = manager.getRepository(AnonymousConfession);
      const confession = await confessionRepo.findOne({
        where: { id },
      });

      if (!confession) {
        throw new NotFoundException('Confession not found');
      }

      confession.isHidden = true;
      const saved = await confessionRepo.save(confession);

      await this.moderationService.logAction(
        adminId,
        AuditActionType.CONFESSION_HIDDEN,
        'confession',
        id,
        { reason },
        reason,
        request,
        manager,
      );

      return saved;
    });
  }

  async unhideConfession(
    id: string,
    adminId: number,
    request?: Request,
  ): Promise<AnonymousConfession> {
    return this.runInModerationTransaction(async (manager) => {
      const confessionRepo = manager.getRepository(AnonymousConfession);
      const confession = await confessionRepo.findOne({
        where: { id },
      });

      if (!confession) {
        throw new NotFoundException('Confession not found');
      }

      confession.isHidden = false;
      const saved = await confessionRepo.save(confession);

      await this.moderationService.logAction(
        adminId,
        AuditActionType.CONFESSION_UNHIDDEN,
        'confession',
        id,
        null,
        null,
        request,
        manager,
      );

      return saved;
    });
  }

  // Users
  async banUser(
    userId: number,
    adminId: number,
    reason: string | null,
    request?: Request,
  ): Promise<User> {
    return this.runInModerationTransaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (!user.is_active) {
        throw new BadRequestException('User is already banned');
      }

      user.is_active = false;
      const saved = await userRepo.save(user);

      await this.moderationService.logAction(
        adminId,
        AuditActionType.USER_BANNED,
        'user',
        userId.toString(),
        { reason },
        reason,
        request,
        manager,
      );

      return saved;
    });
  }

  async unbanUser(
    userId: number,
    adminId: number,
    request?: Request,
  ): Promise<User> {
    return this.runInModerationTransaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.is_active) {
        throw new BadRequestException('User is not banned');
      }

      user.is_active = true;
      const saved = await userRepo.save(user);

      await this.moderationService.logAction(
        adminId,
        AuditActionType.USER_UNBANNED,
        'user',
        userId.toString(),
        null,
        null,
        request,
        manager,
      );

      return saved;
    });
  }

  async searchUsers(
    query: string,
    limit = 50,
    offset = 0,
  ): Promise<[User[], number]> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.username ILIKE :query', { query: `%${query}%` })
      .orWhere('user.emailHash = :hash', {
        hash: query, // This won't work well, but keeping for structure
      })
      .orderBy('user.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    return qb.getManyAndCount();
  }

  async getUserHistory(userId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: [],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get reports created by this user
    const reports = await this.reportRepository.find({
      where: { reporterId: userId },
      relations: ['confession'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    for (const r of reports) {
      if (r.confession?.message) {
        r.confession.message = this.safeDecryptConfessionMessage(
          r.confession.message,
        );
      }
    }

    // Confessions are linked to AnonymousUser. We map User -> AnonymousUser sessions.
    const links = await this.userAnonRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const anonIds = Array.from(new Set(links.map((l) => l.anonymousUserId)));
    const confessions = anonIds.length
      ? await this.confessionRepository
          .createQueryBuilder('confession')
          .leftJoin('confession.anonymousUser', 'anon')
          .where('anon.id IN (:...anonIds)', { anonIds })
          .orderBy('confession.created_at', 'DESC')
          .take(200)
          .getMany()
      : [];

    // Decrypt confession messages for admin visibility
    for (const conf of confessions) {
      if (conf.message) {
        conf.message = this.safeDecryptConfessionMessage(conf.message);
      }
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.role === UserRole.ADMIN,
        is_active: user.is_active,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      confessions,
      reports,
      note: anonIds.length
        ? 'Confessions derived from user session mappings (user_anonymous_users)'
        : 'No anonymous session mappings found for this user yet',
    };
  }

  // Operator anchor & tip lookup (Issue #778)
  async lookupAnchorAndTip(params: {
    txHash?: string;
    confessionId?: string;
  }): Promise<{
    anchor: {
      confessionId: string | null;
      stellarTxHash: string | null;
      stellarHash: string | null;
      isAnchored: boolean;
      anchoredAt: Date | null;
    } | null;
    tips: {
      id: string;
      txId: string;
      amount: number;
      senderAddress: string | null;
      verificationStatus: string;
      verifiedAt: Date | null;
      createdAt: Date;
    }[];
  }> {
    const { txHash, confessionId } = params;

    if (!txHash && !confessionId) {
      throw new BadRequestException(
        'At least one of txHash or confessionId is required',
      );
    }

    let confession: AnonymousConfession | null = null;
    let tips: Tip[] = [];

    if (txHash) {
      // Look up confession by stellar tx hash
      confession = await this.confessionRepository.findOne({
        where: { stellarTxHash: txHash },
        select: [
          'id',
          'stellarTxHash',
          'stellarHash',
          'isAnchored',
          'anchoredAt',
        ] as any,
      });

      // Also look for a tip by tx ID
      const tip = await this.tipRepository.findOne({
        where: { txId: txHash },
      });
      if (tip) tips = [tip];
    }

    if (confessionId) {
      if (!confession) {
        confession = await this.confessionRepository.findOne({
          where: { id: confessionId },
          select: [
            'id',
            'stellarTxHash',
            'stellarHash',
            'isAnchored',
            'anchoredAt',
          ] as any,
        });
      }

      // Fetch all tips for this confession
      if (tips.length === 0) {
        tips = await this.tipRepository.find({
          where: { confessionId },
          order: { createdAt: 'DESC' },
        });
      }
    }

    return {
      anchor: confession
        ? {
            confessionId: confession.id,
            stellarTxHash: confession.stellarTxHash ?? null,
            stellarHash: confession.stellarHash ?? null,
            isAnchored: confession.isAnchored ?? false,
            anchoredAt: confession.anchoredAt ?? null,
          }
        : null,
      tips: tips.map((t) => ({
        id: t.id,
        txId: t.txId,
        amount: Number(t.amount),
        senderAddress: t.senderAddress,
        verificationStatus: t.verificationStatus,
        verifiedAt: t.verifiedAt,
        createdAt: t.createdAt,
      })),
    };
  }

  async getReportStats(): Promise<{
    pendingCount: number;
    oldestUnresolvedAge: number | null;
    resolvedTodayCount: number;
  }> {
    const pendingCount = await this.reportRepository.count({
      where: { status: ReportStatus.PENDING },
    });

    const oldestPending = await this.reportRepository.findOne({
      where: { status: ReportStatus.PENDING },
      order: { createdAt: 'ASC' },
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const resolvedToday = await this.reportRepository
      .createQueryBuilder('report')
      .where('report.status = :status', { status: ReportStatus.RESOLVED })
      .andWhere('report.resolvedAt >= :todayStart', { todayStart })
      .getCount();

    return {
      pendingCount,
      oldestUnresolvedAge: oldestPending
        ? Math.floor((Date.now() - oldestPending.createdAt.getTime()) / 1000)
        : null,
      resolvedTodayCount: resolvedToday,
    };
  }

  // Analytics
  async getAnalytics(startDate?: Date, endDate?: Date) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    // Total counts
    const totalUsers = await this.userRepository.count();
    const totalConfessions = await this.confessionRepository.count();
    const totalReports = await this.reportRepository.count();

    // Active users (last 30 days)
    const activeUsers = await this.userRepository
      .createQueryBuilder('user')
      .where('user.updatedAt >= :start', { start })
      .getCount();

    // Reports by status
    const reportsByStatus = await this.reportRepository
      .createQueryBuilder('report')
      .select('report.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('report.createdAt >= :start', { start })
      .andWhere('report.createdAt <= :end', { end })
      .groupBy('report.status')
      .getRawMany();

    // Reports by type
    const reportsByType = await this.reportRepository
      .createQueryBuilder('report')
      .select('report.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('report.createdAt >= :start', { start })
      .andWhere('report.createdAt <= :end', { end })
      .groupBy('report.type')
      .getRawMany();

    // Confessions over time (daily)
    const confessionsOverTime = await this.confessionRepository
      .createQueryBuilder('confession')
      .select("DATE_TRUNC('day', confession.created_at)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('confession.created_at >= :start', { start })
      .andWhere('confession.created_at <= :end', { end })
      .groupBy("DATE_TRUNC('day', confession.created_at)")
      .orderBy('date', 'ASC')
      .getRawMany();

    // Banned users
    const bannedUsers = await this.userRepository.count({
      where: { is_active: false },
    });

    // Hidden confessions
    const hiddenConfessions = await this.confessionRepository.count({
      where: { isHidden: true },
    });

    // Deleted confessions
    const deletedConfessions = await this.confessionRepository.count({
      where: { isDeleted: true },
    });

    return {
      overview: {
        totalUsers,
        activeUsers,
        totalConfessions,
        totalReports,
        bannedUsers,
        hiddenConfessions,
        deletedConfessions,
      },
      reports: {
        byStatus: reportsByStatus,
        byType: reportsByType,
      },
      trends: {
        confessionsOverTime,
      },
      period: {
        start,
        end,
      },
    };
  }

  async getObservability(startDate?: Date, endDate?: Date) {
    const [auditStats, diagnostics] = await Promise.all([
      this.auditLogService.getStatistics(startDate, endDate),
      this.jobManagementService.getDiagnostics(),
    ]);

    return {
      audit: {
        totalLogs: auditStats.totalLogs,
        actionTypeCounts: auditStats.actionTypeCounts,
      },
      notifications: {
        main: diagnostics.main,
        dlq: diagnostics.dlq,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
