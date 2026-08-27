import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportStatus, ReportType } from '../admin/entities/report.entity'
import { CreateReportDto } from './dto/create-report.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { GetReportsQueryDto } from './dto/get-reports-query.dto';
import { PaginatedReportsResponseDto } from './dto/get-reports-response.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { User, UserRole } from '../user/entities/user.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { assertCanUseAnonymousIdentity } from '../common/security/anonymous-identity-ownership';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import {
  OutboxEvent,
  OutboxStatus,
} from '../common/entities/outbox-event.entity';

export const DUPLICATE_REPORT_MESSAGE =
  'You have already reported this confession within the last 24 hours.';

function isDuplicateReportConstraintViolation(err: unknown): boolean {
  const code =
    (err as { code?: string; driverError?: { code?: string } })?.code ??
    (err as { driverError?: { code?: string } })?.driverError?.code;
  return code === '23505';
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepository: Repository<AnonymousConfession>,
    @InjectRepository(AnonymousUser)
    private readonly anonymousUserRepository: Repository<AnonymousUser>,
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createReport(
    confessionId: string,
    reporterId: number | null,
    dto: CreateReportDto,
    context?: {
      ipAddress?: string;
      userAgent?: string;
      anonymousUserId?: string;
    },
    idempotencyKey?: string,
  ): Promise<Report> {
    if (reporterId === null && !context?.anonymousUserId) {
      throw new BadRequestException(
        'Anonymous reports require a valid anonymous identity',
      );
    }

    if (reporterId === null && context?.anonymousUserId) {
      const anonymousReporter = await this.anonymousUserRepository.findOne({
        where: { id: context.anonymousUserId },
        relations: ['userLinks'],
      });
      assertCanUseAnonymousIdentity(anonymousReporter);
    }

    // ── Idempotency replay ────────────────────────────────────────────────────
    // Only attempt lookup when a key was supplied AND we have a stable user ID.
    if (idempotencyKey && reporterId !== null) {
      const prior = await this.reportRepository.findOne({
        where: { idempotencyKey, reporterId },
      });

      if (prior) {
        this.logger.debug(
          `Idempotent replay for key="${idempotencyKey}" reporter=${reporterId}`,
        );
        return prior;
      }
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.reportRepository.manager.transaction(async (manager) => {
      // 1️⃣ Ensure confession exists
      const confessionRepo = manager.getRepository(AnonymousConfession);
      const reportRepo = manager.getRepository(Report);
      const outboxRepo = manager.getRepository(OutboxEvent);

      const confession = await confessionRepo.findOne({
        where: { id: confessionId },
        relations: [
          'anonymousUser',
          'anonymousUser.userLinks',
          'anonymousUser.userLinks.user',
        ],
      });

      if (!confession) {
        throw new NotFoundException('Confession not found');
      }

      // 2️⃣ Duplicate-report check (24-hour window)
      const qb = manager
        .getRepository(Report)
        .createQueryBuilder('report')
        .where('report.confessionId = :confessionId', { confessionId })
        .andWhere('report.createdAt > :since', { since });

      if (reporterId !== null) {
        qb.andWhere('report.reporterId = :reporterId', { reporterId });
      } else if (context?.anonymousUserId) {
        qb.andWhere('report.anonymousReporterId = :anonymousReporterId', {
          anonymousReporterId: context.anonymousUserId,
        });
      }

      const existingReport = await qb.getOne();
      if (existingReport) {
        // Return the existing report for idempotent replay rather than an error.
        // This gives callers a deterministic response for retried submissions
        // without creating duplicate moderation records.
        this.logger.debug(
          `Deduplicated report for confession ${confessionId} by ${
            reporterId !== null
              ? `reporter ${reporterId}`
              : `anon ${context?.anonymousUserId ?? 'unknown'}`
          } — returning existing report ${existingReport.id}`,
        );
        return existingReport;
      }

      // 3️⃣ Persist — DB unique index catches any concurrent duplicates
      const report = manager.getRepository(Report).create({
        confessionId,
        reporterId: reporterId ?? undefined,
        anonymousReporterId:
          reporterId === null ? context?.anonymousUserId : undefined,
        type: dto.type ?? ReportType.OTHER,
        reason: dto.reason ?? null,
        status: ReportStatus.PENDING,
        // Idempotency fields (null when no key was provided)
        idempotencyKey: idempotencyKey ?? null,
      });

      let savedReport: Report;
      try {
        savedReport = await reportRepo.save(report);
      } catch (err: unknown) {
        if (isDuplicateReportConstraintViolation(err)) {
          // Concurrent duplicate hit the DB unique index — look up and return
          // the winner row so the caller gets a deterministic response.
          const concurrent = await reportRepo.findOne({
            where: {
              confessionId,
              ...(idempotencyKey && reporterId !== null
                ? { idempotencyKey, reporterId }
                : {}),
            },
          });
          if (concurrent) return concurrent;
          throw new BadRequestException(DUPLICATE_REPORT_MESSAGE);
        }
        throw err;
      }

      // 4️⃣ Create Outbox Event for report notification
      // We notify the confession author that their content was reported.
      const recipientEmail = this.getRecipientEmail(confession.anonymousUser);
      if (recipientEmail) {
        await outboxRepo.save(
          outboxRepo.create({
            type: 'report_notification',
            payload: {
              reportId: savedReport.id,
              confessionId: confession.id,
              recipientEmail,
              type: savedReport.type,
              reason: savedReport.reason,
            },
            idempotencyKey: `report:${savedReport.id}`,
            status: OutboxStatus.PENDING,
          }),
        );
      }

      // 5️⃣ Audit log (non-blocking)
      if (reporterId) {
        this.auditLogService
          .logReport(
            savedReport.id,
            'confession',
            confessionId,
            reporterId.toString(),
            dto.reason ?? 'unspecified',
            {
              ipAddress: context?.ipAddress,
              userAgent: context?.userAgent,
              userId: reporterId.toString(),
            },
          )
          .catch((error) => {
            this.logger.error(
              `Failed to log report creation: ${error.message}`,
            );
          });
      }

      return savedReport;
    });
  }

  private getRecipientEmail(anonymousUser: AnonymousUser): string | null {
    if (!anonymousUser) return null;
    const link = anonymousUser.userLinks?.[0];
    if (link?.user) {
      return link.user.getEmail();
    }
    return null;
  }

  async resolveReport(
    reportId: string,
    admin: User,
    options?: { reason?: string; ipAddress?: string; userAgent?: string },
  ): Promise<Report> {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!report)
      throw new NotFoundException(`Report with ID ${reportId} not found`);
    if (!this.isAdmin(admin))
      throw new ForbiddenException('Only admins can resolve reports');
    if (
      report.status === ReportStatus.RESOLVED ||
      report.status === ReportStatus.DISMISSED
    ) {
      throw new BadRequestException(`Report is already ${report.status}`);
    }

    const previousStatus = report.status;
    report.status = ReportStatus.RESOLVED;
    report.resolvedBy = admin.id;
    report.resolvedAt = new Date();
    report.resolutionNotes = options?.reason || 'Report resolved';

    const updatedReport = await this.reportRepository.save(report);

    this.auditLogService
      .logReportResolved(
        reportId,
        admin.id.toString(),
        {
          previousStatus,
          reason: options?.reason,
          confessionId: report.confessionId,
          resolvedBy: admin.username,
        },
        { ipAddress: options?.ipAddress, userAgent: options?.userAgent },
      )
      .catch((e) =>
        this.logger.error(`Failed to log report resolution: ${e.message}`),
      );

    this.logger.log(`Report ${reportId} resolved by admin ${admin.id}`);
    return updatedReport;
  }

  async dismissReport(
    reportId: string,
    admin: User,
    options?: { reason?: string; ipAddress?: string; userAgent?: string },
  ): Promise<Report> {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!report)
      throw new NotFoundException(`Report with ID ${reportId} not found`);
    if (!this.isAdmin(admin))
      throw new ForbiddenException('Only admins can dismiss reports');
    if (
      report.status === ReportStatus.RESOLVED ||
      report.status === ReportStatus.DISMISSED
    ) {
      throw new BadRequestException(`Report is already ${report.status}`);
    }

    const previousStatus = report.status;
    report.status = ReportStatus.DISMISSED;
    report.resolvedBy = admin.id;
    report.resolvedAt = new Date();
    report.resolutionNotes = options?.reason ?? 'Report dismissed';

    const updatedReport = await this.reportRepository.save(report);

    this.auditLogService
      .logReportDismissed(
        reportId,
        admin.id.toString(),
        {
          previousStatus,
          reason: options?.reason,
          confessionId: report.confessionId,
          dismissedBy: admin.username,
        },
        { ipAddress: options?.ipAddress, userAgent: options?.userAgent },
      )
      .catch((e) =>
        this.logger.error(`Failed to log report dismissal: ${e.message}`),
      );

    this.logger.log(`Report ${reportId} dismissed by admin ${admin.id}`);
    return updatedReport;
  }

  async actionReport(
    id: string,
    admin: RequestUser,
    dto: ResolveReportDto,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<Report> {
    const report = await this.reportRepository.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!report) throw new NotFoundException(`Report with ID ${id} not found`);
    if (
      report.status === ReportStatus.RESOLVED ||
      report.status === ReportStatus.DISMISSED
    ) {
      throw new BadRequestException(`Report is already ${report.status}`);
    }

    const action = dto.action;
    const previousStatus = report.status;
    const status =
      action === 'resolved' ? ReportStatus.RESOLVED : ReportStatus.DISMISSED;
    const defaultNote =
      action === 'resolved' ? 'Report resolved' : 'Report dismissed';

    report.status = status;
    report.resolvedBy = admin.id;
    report.resolvedAt = new Date();
    report.resolutionNotes = dto.note ?? defaultNote;

    const updatedReport = await this.reportRepository.save(report);

    if (action === 'resolved') {
      this.auditLogService
        .logReportResolved(
          id,
          admin.id.toString(),
          {
            previousStatus,
            reason: dto.note,
            confessionId: report.confessionId,
            resolvedBy: admin.username,
          },
          { ipAddress: context?.ipAddress, userAgent: context?.userAgent },
        )
        .catch((e) =>
          this.logger.error(`Failed to log report resolution: ${e.message}`),
        );
    } else {
      this.auditLogService
        .logReportDismissed(
          id,
          admin.id.toString(),
          {
            previousStatus,
            reason: dto.note,
            confessionId: report.confessionId,
            dismissedBy: admin.username,
          },
          { ipAddress: context?.ipAddress, userAgent: context?.userAgent },
        )
        .catch((e) =>
          this.logger.error(`Failed to log report dismissal: ${e.message}`),
        );
    }

    this.logger.log(`Report ${id} ${action} by admin ${admin.id}`);
    return updatedReport;
  }

  async getReportAuditLogs(reportId: string): Promise<any> {
    return this.auditLogService.findByEntity('report', reportId);
  }

  async findAll(options?: {
    status?: ReportStatus;
    page?: number;
    limit?: number;
  }): Promise<{ items: Report[]; total: number }> {
    const { status, page = 1, limit = 20 } = options || {};
    const query = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.resolver', 'resolver')
      .orderBy('report.createdAt', 'DESC');

    if (status) query.andWhere('report.status = :status', { status });

    const [items, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  async findOne(id: string): Promise<Report> {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: ['resolver'],
    });
    if (!report) throw new NotFoundException(`Report with ID ${id} not found`);
    return report;
  }

  async getReportsWithFilters(
    query: GetReportsQueryDto,
  ): Promise<PaginatedReportsResponseDto> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    const queryBuilder = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.confession', 'confession')
      .leftJoinAndSelect('report.reporter', 'reporter')
      .leftJoinAndSelect('report.resolver', 'resolver');

    if (query.status)
      queryBuilder.andWhere('report.status = :status', {
        status: query.status,
      });
    if (query.reason)
      queryBuilder.andWhere('report.type = :reason', { reason: query.reason });

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere(
        'report.createdAt BETWEEN :startDate AND :endDate',
        {
          startDate: new Date(query.startDate),
          endDate: new Date(query.endDate),
        },
      );
    } else if (query.startDate) {
      queryBuilder.andWhere('report.createdAt >= :startDate', {
        startDate: new Date(query.startDate),
      });
    } else if (query.endDate) {
      queryBuilder.andWhere('report.createdAt <= :endDate', {
        endDate: new Date(query.endDate),
      });
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'DESC';
    queryBuilder.orderBy(`report.${sortBy}`, sortOrder);

    const total = await queryBuilder.getCount();
    const reports = await queryBuilder.skip(offset).take(limit).getMany();

    return {
      data: reports.map((report) => ({
        id: report.id,
        confessionId: report.confessionId,
        reporterId: report.reporterId,
        type: report.type,
        reason: report.reason,
        status: report.status,
        resolvedBy: report.resolvedBy,
        resolvedAt: report.resolvedAt,
        resolutionNotes: report.resolutionNotes,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private isAdmin(user: User): boolean {
    return user.role === UserRole.ADMIN;
  }
}
