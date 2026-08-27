import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface RetentionPolicyConfig {
  retentionDays: number;
  auditCleanupActions: boolean;
  dryRun: boolean;
}

type CleanupCandidate = Pick<ExportRequest, 'id' | 'status' | 'createdAt'>;

export interface CleanupRunResult {
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  eligibleCount: number;
  expiredCount: number;
  chunkCount: number;
  statusCounts: Record<string, number>;
  requestIds: string[];
  omittedRequestIds: number;
}

const CLEANUP_ELIGIBLE_STATUSES = ['PENDING', 'PROCESSING', 'READY', 'FAILED'];

@Injectable()
export class DataCleanupService {
  private readonly logger = new Logger(DataCleanupService.name);
  private readonly retentionDays: number;
  private readonly auditCleanupActions: boolean;
  private readonly configuredDryRun: boolean;

  constructor(
    @InjectRepository(ExportRequest) private repo: Repository<ExportRequest>,
    @InjectRepository(ExportChunk) private chunkRepo: Repository<ExportChunk>,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.retentionDays = this.configService.get<number>(
      'export.retentionDays',
      7,
    );
    this.auditCleanupActions = this.configService.get<boolean>(
      'export.auditCleanupActions',
      true,
    );
    this.configuredDryRun = this.configService.get<boolean>(
      'export.dryRun',
      false,
    );
  }

  private getRetentionCutoff(): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    return cutoff;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeOldExports(): Promise<CleanupRunResult> {
    return this.runCleanup(this.configuredDryRun);
  }

  /**
   * Run the retention-cleanup sweep. Pass dryRun=true to compute and
   * report what WOULD be deleted without making any changes.
   */
  async runCleanup(dryRun = this.configuredDryRun): Promise<CleanupRunResult> {
    const cutoff = this.getRetentionCutoff();
    let eligibleExports: CleanupCandidate[] = [];

    this.logger.log(
      `Starting ${dryRun ? 'DRY-RUN ' : ''}export retention cleanup. Retaining exports created after ${cutoff.toISOString()} (${this.retentionDays} days)`,
    );

    try {
      eligibleExports = await this.repo.find({
        where: {
          createdAt: LessThan(cutoff),
          status: In(CLEANUP_ELIGIBLE_STATUSES),
        },
        select: ['id', 'status', 'createdAt'],
      });

      const requestIds = eligibleExports.map((e) => e.id);
      let chunkCount = 0;

      if (requestIds.length > 0) {
        chunkCount = await this.chunkRepo.count({
          where: { exportRequestId: In(requestIds) },
        });
      }

      let expiredCount = 0;

      if (eligibleExports.length === 0) {
        this.logger.log(
          `No expired exports found to clean up. ${this.formatCleanupSummary(eligibleExports, cutoff, chunkCount)}`,
        );
      } else if (dryRun) {
        this.logger.log(
          `[DRY-RUN] Found ${eligibleExports.length} expired export request(s) and ${chunkCount} chunk(s) that WOULD be cleaned up. ${this.formatCleanupSummary(eligibleExports, cutoff, chunkCount)}`,
        );
      } else {
        this.logger.log(
          `Found ${eligibleExports.length} expired export request(s) eligible for cleanup. ${this.formatCleanupSummary(eligibleExports, cutoff, chunkCount)}`,
        );

        if (requestIds.length > 0) {
          await this.chunkRepo.delete({ exportRequestId: In(requestIds) });
        }

        const result = await this.repo.update(
          {
            createdAt: LessThan(cutoff),
            status: In(CLEANUP_ELIGIBLE_STATUSES),
          },
          {
            fileData: null,
            status: 'EXPIRED',
            expiredAt: new Date(),
            downloadTokenHash: null,
          },
        );

        expiredCount = result.affected ?? 0;

        this.logger.log(
          `Expired ${expiredCount} export request(s) and removed ${chunkCount} chunk(s). ${this.formatCleanupSummary(eligibleExports, cutoff, chunkCount)}`,
        );
      }

      const summary = this.buildSummary(
        eligibleExports,
        cutoff,
        chunkCount,
        expiredCount,
        dryRun,
      );

      if (this.auditCleanupActions) {
        await this.logCleanupAuditSummary(summary);
      }

      return summary;
    } catch (error) {
      this.logger.error(
        `Export ${dryRun ? 'dry-run ' : ''}cleanup failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }. ${this.formatCleanupSummary(eligibleExports, cutoff, 0)}`,
      );
      throw error;
    }
  }

  private buildSummary(
    exports: CleanupCandidate[],
    cutoff: Date,
    chunkCount: number,
    expiredCount: number,
    dryRun: boolean,
  ): CleanupRunResult {
    const statusCounts = exports.reduce<Record<string, number>>(
      (counts, exportRecord) => ({
        ...counts,
        [exportRecord.status]: (counts[exportRecord.status] ?? 0) + 1,
      }),
      {},
    );
    const requestIds = exports.map((e) => e.id).slice(0, 10);
    const omittedRequestIds = Math.max(exports.length - requestIds.length, 0);

    return {
      dryRun,
      retentionDays: this.retentionDays,
      cutoff: cutoff.toISOString(),
      eligibleCount: exports.length,
      expiredCount,
      chunkCount,
      statusCounts,
      requestIds,
      omittedRequestIds,
    };
  }

  private async logCleanupAuditSummary(
    summary: CleanupRunResult,
  ): Promise<void> {
    try {
      await this.auditLogService.logExportRetentionCleanup({
        dryRun: summary.dryRun,
        retentionDays: summary.retentionDays,
        cutoff: summary.cutoff,
        summary: {
          eligibleCount: summary.eligibleCount,
          expiredCount: summary.expiredCount,
          chunkCount: summary.chunkCount,
          statusCounts: summary.statusCounts,
          requestIds: summary.requestIds,
          omittedRequestIds: summary.omittedRequestIds,
        },
      });
    } catch (auditError) {
      this.logger.warn(
        `Failed to log export retention cleanup audit summary: ${auditError instanceof Error ? auditError.message : 'Unknown error'}`,
      );
    }
  }

  private formatCleanupSummary(
    exports: CleanupCandidate[],
    cutoff: Date,
    chunkCount: number,
  ): string {
    const statusCounts = exports.reduce<Record<string, number>>(
      (counts, exportRecord) => ({
        ...counts,
        [exportRecord.status]: (counts[exportRecord.status] ?? 0) + 1,
      }),
      {},
    );
    const requestIds = exports
      .map((exportRecord) => exportRecord.id)
      .slice(0, 10);
    const omittedRequestIds = Math.max(exports.length - requestIds.length, 0);

    return [
      `retentionDays=${this.retentionDays}`,
      `cutoff=${cutoff.toISOString()}`,
      `eligibleCount=${exports.length}`,
      `chunkCount=${chunkCount}`,
      `statusCounts=${JSON.stringify(statusCounts)}`,
      `requestIds=${JSON.stringify(requestIds)}`,
      `omittedRequestIds=${omittedRequestIds}`,
    ].join(' ');
  }

  async getRetentionPolicy(): Promise<RetentionPolicyConfig> {
    return {
      retentionDays: this.retentionDays,
      auditCleanupActions: this.auditCleanupActions,
      dryRun: this.configuredDryRun,
    };
  }
}
