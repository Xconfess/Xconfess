import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { ExportRequest } from './entities/export-request.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface RetentionPolicyConfig {
  retentionDays: number;
  auditCleanupActions: boolean;
}

type CleanupCandidate = Pick<ExportRequest, 'id' | 'status' | 'createdAt'>;

@Injectable()
export class DataCleanupService {
  private readonly logger = new Logger(DataCleanupService.name);
  private readonly retentionDays: number;
  private readonly auditCleanupActions: boolean;

  constructor(
    @InjectRepository(ExportRequest) private repo: Repository<ExportRequest>,
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
  }

  private getRetentionCutoff(): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    return cutoff;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeOldExports(): Promise<void> {
    const cutoff = this.getRetentionCutoff();
    let eligibleExports: CleanupCandidate[] = [];

    this.logger.log(
      `Starting scheduled export cleanup. Retaining exports created after ${cutoff.toISOString()} (${this.retentionDays} days)`,
    );

    try {
      eligibleExports = await this.repo.find({
        where: {
          createdAt: LessThan(cutoff),
          status: In(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
        },
        select: ['id', 'status', 'createdAt'],
      });

      if (eligibleExports.length === 0) {
        this.logger.log(
          `No expired exports found to clean up. ${this.formatCleanupSummary(
            eligibleExports,
            cutoff,
          )}`,
        );
        return;
      }

      this.logger.log(
        `Found ${eligibleExports.length} expired export request(s) eligible for cleanup. ${this.formatCleanupSummary(
          eligibleExports,
          cutoff,
        )}`,
      );

      const result = await this.repo.update(
        {
          createdAt: LessThan(cutoff),
          status: In(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
        },
        { fileData: null, status: 'EXPIRED', expiredAt: new Date() },
      );

      this.logger.log(
        `Expired ${result.affected ?? 0} export request(s). ${this.formatCleanupSummary(
          eligibleExports,
          cutoff,
        )}`,
      );

      if (this.auditCleanupActions) {
        await this.logCleanupAuditTrail(eligibleExports, cutoff);
      }
    } catch (error) {
      this.logger.error(
        `Export cleanup failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }. ${this.formatCleanupSummary(eligibleExports, cutoff)}`,
      );
      throw error;
    }
  }

  private async logCleanupAuditTrail(
    exports: CleanupCandidate[],
    cutoff: Date,
  ): Promise<void> {
    for (const exportRecord of exports) {
      try {
        await this.auditLogService.logExportLifecycleEvent({
          action: 'expired',
          actorType: 'system',
          actorId: 'retention-cleanup-scheduler',
          requestId: exportRecord.id,
          exportId: exportRecord.id,
          metadata: {
            previousStatus: exportRecord.status,
            newStatus: 'EXPIRED',
            retentionPolicyDays: this.retentionDays,
            retentionCutoffDate: cutoff.toISOString(),
            cleanedUpAt: new Date().toISOString(),
            reason: 'retention_window_elapsed',
          },
        });
      } catch (auditError) {
        this.logger.warn(
          `Failed to log audit trail for export requestId=${exportRecord.id}: ${auditError instanceof Error ? auditError.message : 'Unknown error'}`,
        );
      }
    }
  }

  private formatCleanupSummary(
    exports: CleanupCandidate[],
    cutoff: Date,
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
      `statusCounts=${JSON.stringify(statusCounts)}`,
      `requestIds=${JSON.stringify(requestIds)}`,
      `omittedRequestIds=${omittedRequestIds}`,
    ].join(' ');
  }

  async getRetentionPolicy(): Promise<RetentionPolicyConfig> {
    return {
      retentionDays: this.retentionDays,
      auditCleanupActions: this.auditCleanupActions,
    };
  }
}
