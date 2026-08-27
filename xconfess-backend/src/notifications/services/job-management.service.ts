import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../logger/logger.service';
import {
  AuditLogContext,
  AuditLogService,
} from '../../audit-log/audit-log.service';
import {
  NOTIFICATION_QUEUE,
  NOTIFICATION_DLQ,
  NotificationJobData,
} from '../processors/notification.processor';
import { getDlqRetentionConfig } from '../../config/dlq-retention.config';

export interface DlqJobFilter {
  failedAfter?: string;
  failedBefore?: string;
  search?: string;
  jobIds?: string[];
}

export interface DlqReplayOutcome {
  jobId: string;
  originalJobId: string | null;
  replayJobId: string;
  outcome: 'replayed' | 'deduplicated' | 'failed';
  newJobId?: string;
  existingJobId?: string;
  error?: string;
}

export interface DlqCleanupOutcome {
  jobId: string;
  originalJobId: string | null;
  outcome: 'removed' | 'failed';
  error?: string;
}

function toAuditRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class JobManagementService {
  private readonly dlqStates: Array<
    'failed' | 'completed' | 'waiting' | 'active' | 'delayed'
  > = ['failed', 'completed', 'waiting', 'active', 'delayed'];

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly mainQueue: Queue<NotificationJobData>,
    @InjectQueue(NOTIFICATION_DLQ)
    private readonly dlq: Queue<NotificationJobData>,
    private readonly configService: ConfigService,
    private readonly appLogger: AppLogger,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listDlqJobs(page = 1, limit = 20, filter?: DlqJobFilter) {
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const jobs = await this.dlq.getJobs(this.dlqStates, start, end, true);

    const totalObj = await this.dlq.getJobCounts();
    const totalCount =
      (totalObj as any).failed +
      (totalObj as any).completed +
      (totalObj as any).waiting +
      (totalObj as any).active +
      (totalObj as any).delayed;

    // Apply filtering if provided (Bull's getJobs doesn't filter by payload/reason out of the box easily)
    let filteredJobs = jobs;
    if (filter) {
      filteredJobs = jobs.filter((job) => this.matchesDlqFilter(job, filter));
    }

    return {
      jobs: filteredJobs.map((job) => this.serializeDlqJob(job)),
      total: totalCount,
      page,
      limit,
    };
  }

  private serializeDlqJob(job: Job<NotificationJobData>) {
    const metadata = toRecord(job.data.metadata);
    const jobDetails = job as Job<NotificationJobData> & {
      name?: string;
      failedReason?: string;
      finishedOn?: number;
      opts?: { attempts?: number };
    };
    const attemptsMade = this.getDlqAttemptsMade(job);
    const failedReason =
      job.data._meta?.lastError || jobDetails.failedReason || null;
    const failedAt =
      job.data._meta?.failedAt ||
      this.timestampToIsoString(jobDetails.finishedOn) ||
      null;

    return {
      id: String(job.id),
      name: jobDetails.name || job.data.type || 'dead-letter',
      attemptsMade,
      maxAttempts: this.getDlqMaxAttempts(job),
      failedReason,
      failedAt,
      createdAt: this.timestampToIsoString(job.timestamp),
      channel: this.getStringField(metadata, 'channel') || 'email',
      recipientEmail:
        this.getStringField(
          job.data as unknown as Record<string, unknown>,
          'recipientEmail',
        ) || this.getStringField(metadata, 'recipientEmail'),
      userId: job.data.userId,
      type: job.data.type,
      title: job.data.title,
      lastError: failedReason,
      enqueuedAt: job.timestamp,
    };
  }

  private getDlqAttemptsMade(job: Job<NotificationJobData>): number {
    const attemptsMade = job.data._meta?.attemptsMade;
    if (typeof attemptsMade === 'number') {
      return attemptsMade;
    }
    const jobAttempts = (
      job as Job<NotificationJobData> & { attemptsMade?: number }
    ).attemptsMade;
    return typeof jobAttempts === 'number' ? jobAttempts : 0;
  }

  private getDlqMaxAttempts(job: Job<NotificationJobData>): number {
    const attempts = (
      job as Job<NotificationJobData> & { opts?: { attempts?: number } }
    ).opts?.attempts;
    return typeof attempts === 'number' ? attempts : 1;
  }

  private timestampToIsoString(timestamp?: number): string | null {
    return typeof timestamp === 'number'
      ? new Date(timestamp).toISOString()
      : null;
  }

  private getStringField(
    record: Record<string, unknown>,
    field: string,
  ): string | undefined {
    const value = record[field];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  async replayDlqJob(
    jobId: string,
    actorId: string,
    reason?: string,
    context?: AuditLogContext,
  ) {
    const job = await this.dlq.getJob(jobId);
    if (!job) throw new NotFoundException(`DLQ job ${jobId} not found`);

    const operationId = this.buildOperationId('single-replay', actorId);
    const outcome = await this.replayJobSafely(job);
    const summary = this.buildReplaySummary([outcome]);

    await this.auditLogService.logNotificationDlqReplay(actorId, {
      replayType: 'single',
      queue: NOTIFICATION_QUEUE,
      operationId,
      jobId: String(job.id),
      targetJobIds: [String(job.id)],
      targetJobs: [this.toAuditTarget(job)],
      outcomes: [toAuditRecord(outcome)],
      summary,
      reason: reason || null,
      replayedAt: new Date().toISOString(),
    }, context);

    this.emitReplayObservability(operationId, actorId, summary, context);

    return {
      id: job.id,
      outcome: outcome.outcome,
      replayJobId: outcome.replayJobId,
      newJobId: outcome.newJobId ?? outcome.existingJobId ?? null,
    };
  }

  async replayDlqJobsBulk(
    actorId: string,
    options: any,
    context?: AuditLogContext,
  ) {
    const filter = this.normalizeDlqFilter(options);
    const jobs = await this.getFilteredDlqJobs(filter);
    const operationId = this.buildOperationId('bulk-replay', actorId);
    const outcomes: DlqReplayOutcome[] = [];

    for (const job of jobs) {
      outcomes.push(await this.replayJobSafely(job));
    }

    const summary = this.buildReplaySummary(outcomes);

    await this.auditLogService.logNotificationDlqReplay(actorId, {
      replayType: 'bulk',
      queue: NOTIFICATION_QUEUE,
      operationId,
      filters: filter,
      targetJobIds: jobs.map((job) => String(job.id)),
      targetJobs: jobs.map((job) => this.toAuditTarget(job)),
      outcomes: outcomes.map(toAuditRecord),
      summary,
      replayedAt: new Date().toISOString(),
    }, context);

    this.emitReplayObservability(operationId, actorId, summary, context);

    return {
      operationId,
      ...summary,
      outcomes,
    };
  }

  async cleanupDlq(
    actorId: string,
    options: any,
    context?: AuditLogContext,
  ) {
    const retentionConfig = getDlqRetentionConfig(this.configService);
    const filter = this.normalizeDlqFilter(options);
    const requestedMode =
      typeof options?.mode === 'string' ? options.mode.toLowerCase() : null;
    const hasExplicitTargeting =
      Boolean(filter.search) ||
      Boolean(filter.failedAfter) ||
      Boolean(filter.failedBefore) ||
      Boolean(filter.jobIds?.length);
    const useRetentionMode =
      requestedMode === 'retention' ||
      (requestedMode !== 'drain' && !hasExplicitTargeting);
    const operationId = this.buildOperationId(
      useRetentionMode ? 'retention-cleanup' : 'bulk-cleanup',
      actorId,
    );

    const result = useRetentionMode
      ? await this.runRetentionCleanup(options, retentionConfig)
      : await this.runBulkCleanup(filter);

    await this.auditLogService.logNotificationDlqCleanup(
      actorId,
      {
        cleanupType: useRetentionMode ? 'retention' : 'bulk',
        queue: NOTIFICATION_DLQ,
        operationId,
        filters: result.filters,
        targetJobIds: result.targetJobIds,
        targetJobs: result.targetJobs,
        outcomes: result.outcomes.map(toAuditRecord),
        summary: result.summary,
        retentionDays: result.retentionDays,
        batchSize: result.batchSize,
        dryRun: result.dryRun,
      },
      context,
    );

    this.emitCleanupObservability(
      operationId,
      actorId,
      result.summary,
      context,
      useRetentionMode,
    );

    return {
      operationId,
      mode: useRetentionMode ? 'retention' : 'drain',
      ...result.summary,
      outcomes: result.outcomes,
    };
  }

  async getDiagnostics() {
    const [mainCounts, dlqCounts] = await Promise.all([
      this.mainQueue.getJobCounts(),
      this.dlq.getJobCounts(),
    ]);

    return {
      main: mainCounts,
      dlq: dlqCounts,
    };
  }

  private normalizeDlqFilter(options?: any): DlqJobFilter {
    return {
      failedAfter:
        typeof options?.failedAfter === 'string' ? options.failedAfter : undefined,
      failedBefore:
        typeof options?.failedBefore === 'string'
          ? options.failedBefore
          : undefined,
      search: typeof options?.search === 'string' ? options.search : undefined,
      jobIds: this.parseListOption(options?.jobIds ?? options?.ids),
    };
  }

  private parseListOption(value: unknown): string[] | undefined {
    if (Array.isArray(value)) {
      const parsed = value
        .flatMap((entry) =>
          typeof entry === 'string' ? entry.split(',') : String(entry),
        )
        .map((entry) => entry.trim())
        .filter(Boolean);
      return parsed.length > 0 ? parsed : undefined;
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const parsed = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    return parsed.length > 0 ? parsed : undefined;
  }

  private matchesDlqFilter(
    job: Job<NotificationJobData>,
    filter: DlqJobFilter,
  ): boolean {
    if (filter.jobIds?.length && !filter.jobIds.includes(String(job.id))) {
      return false;
    }

    const failedAt = job.data._meta?.failedAt
      ? new Date(job.data._meta.failedAt)
      : null;
    if (filter.failedAfter && failedAt && failedAt < new Date(filter.failedAfter)) {
      return false;
    }
    if (
      filter.failedBefore &&
      failedAt &&
      failedAt > new Date(filter.failedBefore)
    ) {
      return false;
    }

    if (filter.search) {
      const search = filter.search.toLowerCase();
      const content = JSON.stringify(job.data).toLowerCase();
      if (!content.includes(search)) {
        return false;
      }
    }

    return true;
  }

  private async getFilteredDlqJobs(filter?: DlqJobFilter) {
    const jobs = await this.dlq.getJobs(this.dlqStates);
    return filter ? jobs.filter((job) => this.matchesDlqFilter(job, filter)) : jobs;
  }

  private buildOperationId(action: string, actorId: string): string {
    return `${action}:${actorId}:${Date.now()}`;
  }

  private getOriginalJobId(job: Job<NotificationJobData>): string | null {
    return job.data._meta?.originalJobId || null;
  }

  private buildReplayJobId(job: Job<NotificationJobData>): string {
    return `dlq-replay:${this.getOriginalJobId(job) || String(job.id)}`;
  }

  private toAuditTarget(job: Job<NotificationJobData>) {
    return {
      jobId: String(job.id),
      originalJobId: this.getOriginalJobId(job),
      type: job.data.type,
      userId: job.data.userId,
      failedAt: job.data._meta?.failedAt || null,
      lastError: job.data._meta?.lastError || null,
    };
  }

  private buildReplaySummary(outcomes: DlqReplayOutcome[]) {
    const replayed = outcomes.filter((item) => item.outcome === 'replayed').length;
    const deduplicated = outcomes.filter(
      (item) => item.outcome === 'deduplicated',
    ).length;
    const failed = outcomes.filter((item) => item.outcome === 'failed').length;

    return {
      attempted: outcomes.length,
      replayed,
      deduplicated,
      failed,
      noOp: outcomes.length === 0,
    };
  }

  private buildCleanupSummary(outcomes: DlqCleanupOutcome[]) {
    const removed = outcomes.filter((item) => item.outcome === 'removed').length;
    const failed = outcomes.filter((item) => item.outcome === 'failed').length;

    return {
      attempted: outcomes.length,
      removed,
      failed,
      noOp: outcomes.length === 0,
    };
  }

  private async replayJobSafely(
    job: Job<NotificationJobData>,
  ): Promise<DlqReplayOutcome> {
    const jobId = String(job.id);
    const originalJobId = this.getOriginalJobId(job);
    const replayJobId = this.buildReplayJobId(job);
    const recordedReplayJobId = job.data._meta?.replayJobId;

    if (recordedReplayJobId) {
      try {
        await job.remove();
      } catch (error: unknown) {
        return {
          jobId,
          originalJobId,
          replayJobId: recordedReplayJobId,
          outcome: 'failed',
          existingJobId: recordedReplayJobId,
          error:
            error instanceof Error
              ? error.message
              : 'failed to remove already replayed DLQ job',
        };
      }

      return {
        jobId,
        originalJobId,
        replayJobId: recordedReplayJobId,
        outcome: 'deduplicated',
        existingJobId: recordedReplayJobId,
      };
    }

    const existingJob = await this.mainQueue.getJob(replayJobId);

    if (existingJob) {
      await this.markJobAsReplayed(job, replayJobId, 'deduplicated');
      try {
        await job.remove();
      } catch (error: unknown) {
        return {
          jobId,
          originalJobId,
          replayJobId,
          outcome: 'failed',
          existingJobId: String(existingJob.id),
          error:
            error instanceof Error ? error.message : 'failed to remove stale DLQ job',
        };
      }

      return {
        jobId,
        originalJobId,
        replayJobId,
        outcome: 'deduplicated',
        existingJobId: String(existingJob.id),
      };
    }

    const { _meta, ...payload } = job.data;

    try {
      const newJob = await this.mainQueue.add('send-notification', payload, {
        jobId: replayJobId,
      });
      await this.markJobAsReplayed(job, replayJobId, 'replayed');
      try {
        await job.remove();
      } catch (error: unknown) {
        return {
          jobId,
          originalJobId,
          replayJobId,
          outcome: 'failed',
          newJobId: String(newJob.id),
          error:
            error instanceof Error
              ? error.message
              : 'replayed but failed to remove stale DLQ job',
        };
      }

      return {
        jobId,
        originalJobId,
        replayJobId,
        outcome: 'replayed',
        newJobId: String(newJob.id),
      };
    } catch (error: unknown) {
      return {
        jobId,
        originalJobId,
        replayJobId,
        outcome: 'failed',
        error: error instanceof Error ? error.message : 'replay failed',
      };
    }
  }

  private async markJobAsReplayed(
    job: Job<NotificationJobData>,
    replayJobId: string,
    replayOutcome: 'replayed' | 'deduplicated',
  ) {
    if (typeof job.updateData !== 'function') {
      return;
    }

    const existingMeta = job.data._meta;

    await job.updateData({
      ...job.data,
      _meta: {
        originalJobId: existingMeta?.originalJobId,
        failedAt: existingMeta?.failedAt ?? new Date().toISOString(),
        attemptsMade: existingMeta?.attemptsMade ?? 0,
        lastError: existingMeta?.lastError ?? '',
        replayJobId,
        replayOutcome,
        replayedAt: new Date().toISOString(),
      },
    });
  }

  private async runBulkCleanup(filter: DlqJobFilter) {
    const jobs = await this.getFilteredDlqJobs(filter);
    const outcomes: DlqCleanupOutcome[] = [];

    for (const job of jobs) {
      try {
        await job.remove();
        outcomes.push({
          jobId: String(job.id),
          originalJobId: this.getOriginalJobId(job),
          outcome: 'removed',
        });
      } catch (error: unknown) {
        outcomes.push({
          jobId: String(job.id),
          originalJobId: this.getOriginalJobId(job),
          outcome: 'failed',
          error: error instanceof Error ? error.message : 'cleanup failed',
        });
      }
    }

    return {
      filters: filter,
      targetJobIds: jobs.map((job) => String(job.id)),
      targetJobs: jobs.map((job) => this.toAuditTarget(job)),
      outcomes,
      summary: this.buildCleanupSummary(outcomes),
      retentionDays: undefined,
      batchSize: undefined,
      dryRun: undefined,
    };
  }

  private async runRetentionCleanup(
    options: any,
    defaults: ReturnType<typeof getDlqRetentionConfig>,
  ) {
    const retentionDays =
      Number.parseInt(String(options?.retentionDays ?? defaults.retentionDays), 10) ||
      defaults.retentionDays;
    const batchSize =
      Number.parseInt(
        String(options?.batchSize ?? defaults.cleanupBatchSize),
        10,
      ) || defaults.cleanupBatchSize;
    const dryRun =
      typeof options?.dryRun === 'string'
        ? options.dryRun === 'true'
        : Boolean(options?.dryRun ?? defaults.dryRun);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const jobs = (await this.getFilteredDlqJobs()).filter((job) => {
      const failedAt = job.data._meta?.failedAt;
      if (!failedAt) {
        return false;
      }
      return new Date(failedAt) <= cutoff;
    });
    const selectedJobs = jobs.slice(0, batchSize);
    const outcomes: DlqCleanupOutcome[] = [];

    if (!dryRun) {
      for (const job of selectedJobs) {
        try {
          await job.remove();
          outcomes.push({
            jobId: String(job.id),
            originalJobId: this.getOriginalJobId(job),
            outcome: 'removed',
          });
        } catch (error: unknown) {
          outcomes.push({
            jobId: String(job.id),
            originalJobId: this.getOriginalJobId(job),
            outcome: 'failed',
            error: error instanceof Error ? error.message : 'cleanup failed',
          });
        }
      }
    }

    return {
      filters: {
        failedBefore: cutoff.toISOString(),
      },
      targetJobIds: selectedJobs.map((job) => String(job.id)),
      targetJobs: selectedJobs.map((job) => this.toAuditTarget(job)),
      outcomes,
      summary: dryRun
        ? {
            attempted: selectedJobs.length,
            removed: 0,
            failed: 0,
            noOp: selectedJobs.length === 0,
          }
        : this.buildCleanupSummary(outcomes),
      retentionDays,
      batchSize,
      dryRun,
    };
  }

  async exportDlqCsv(filter?: DlqJobFilter): Promise<string> {
    const jobs = await this.getFilteredDlqJobs(filter);
    const header = 'Job ID,Original Job ID,Failure Reason,Retry Count,Failed At,Channel,Recipient Email,Created At,Type\n';
    const rows = jobs.map((job) => {
      const serialized = this.serializeDlqJob(job);
      const csvRow = [
        this.escapeCsvField(serialized.id),
        this.escapeCsvField(job.data._meta?.originalJobId || ''),
        this.escapeCsvField(serialized.failedReason || ''),
        String(serialized.attemptsMade),
        this.escapeCsvField(serialized.failedAt || ''),
        this.escapeCsvField(serialized.channel),
        this.escapeCsvField(serialized.recipientEmail || ''),
        this.escapeCsvField(serialized.createdAt || ''),
        this.escapeCsvField(serialized.type || ''),
      ].join(',');
      return csvRow;
    });
    return header + rows.join('\n');
  }

  private escapeCsvField(value: string): string {
    if (!value) return '""';
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private emitReplayObservability(
    operationId: string,
    actorId: string,
    summary: {
      attempted: number;
      replayed: number;
      deduplicated: number;
      failed: number;
      noOp: boolean;
    },
    context?: AuditLogContext,
  ) {
    this.appLogger.emitEvent(
      'info',
      'notification.dlq.bulk_replay',
      {
        operationId,
        actorId,
        ...summary,
      },
      'NotificationDLQ',
      context?.requestId,
    );

    if (summary.failed > 0) {
      this.appLogger.emitWarningEvent(
        'notification.dlq.bulk_replay_partial_failure',
        {
          operationId,
          actorId,
          ...summary,
        },
        'NotificationDLQ',
        context?.requestId,
      );
    }
  }

  private emitCleanupObservability(
    operationId: string,
    actorId: string,
    summary: {
      attempted: number;
      removed: number;
      failed: number;
      noOp: boolean;
    },
    context: AuditLogContext | undefined,
    retentionMode: boolean,
  ) {
    this.appLogger.emitEvent(
      'info',
      retentionMode
        ? 'notification.dlq.retention_cleanup'
        : 'notification.dlq.bulk_cleanup',
      {
        operationId,
        actorId,
        ...summary,
      },
      'NotificationDLQ',
      context?.requestId,
    );

    if (summary.failed > 0) {
      this.appLogger.emitWarningEvent(
        'notification.dlq.bulk_cleanup_partial_failure',
        {
          operationId,
          actorId,
          ...summary,
        },
        'NotificationDLQ',
        context?.requestId,
      );
    }
  }
}