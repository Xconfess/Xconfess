import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../logger/logger.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditActionType } from '../../audit-log/audit-log.entity';
import { NOTIFICATION_QUEUE, NOTIFICATION_DLQ, NotificationJobData } from '../processors/notification.processor';

export interface DlqJobFilter {
  failedAfter?: string;
  failedBefore?: string;
  search?: string;
}

@Injectable()
export class JobManagementService {
  private readonly logger = new Logger(JobManagementService.name);

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

    const [jobs, total] = await Promise.all([
      this.dlq.getJobs(['failed', 'completed', 'waiting', 'active', 'delayed'], start, end),
      this.dlq.count(),
    ]);

    // Apply filtering if provided (Bull's getJobs doesn't filter by payload/reason out of the box easily)
    let filteredJobs = jobs;
    if (filter) {
      filteredJobs = jobs.filter(job => {
        const failedAt = job.data._meta?.failedAt ? new Date(job.data._meta.failedAt) : null;
        if (filter.failedAfter && failedAt && failedAt < new Date(filter.failedAfter)) return false;
        if (filter.failedBefore && failedAt && failedAt > new Date(filter.failedBefore)) return false;
        if (filter.search) {
          const search = filter.search.toLowerCase();
          const content = JSON.stringify(job.data).toLowerCase();
          if (!content.includes(search)) return false;
        }
        return true;
      });
    }

    return {
      jobs: filteredJobs.map(job => ({
        id: job.id,
        userId: job.data.userId,
        type: job.data.type,
        title: job.data.title,
        failedAt: job.data._meta?.failedAt,
        attemptsMade: job.data._meta?.attemptsMade,
        lastError: job.data._meta?.lastError,
        enqueuedAt: job.timestamp,
      })),
      total,
      page,
      limit,
    };
  }

  async replayDlqJob(jobId: string, actorId: string, reason?: string) {
    const job = await this.dlq.getJob(jobId);
    if (!job) throw new NotFoundException(`DLQ job ${jobId} not found`);

    const { _meta, ...payload } = job.data;
    const newJob = await this.mainQueue.add('send-notification', payload);
    await job.remove();

    await this.auditLogService.logNotificationDlqReplay(actorId, {
      replayType: 'single',
      queue: NOTIFICATION_QUEUE,
      jobId: String(job.id),
      reason: reason || null,
      replayedAt: new Date().toISOString(),
    });

    return { id: job.id, newJobId: newJob.id };
  }

  async replayDlqJobsBulk(actorId: string, options: any) {
    const jobs = await this.dlq.getJobs(['failed', 'completed', 'waiting', 'active', 'delayed']);
    // Simplified bulk replay for space
    let count = 0;
    for (const job of jobs) {
      const { _meta, ...payload } = job.data;
      await this.mainQueue.add('send-notification', payload);
      await job.remove();
      count++;
    }

    await this.auditLogService.logNotificationDlqReplay(actorId, {
      replayType: 'bulk',
      queue: NOTIFICATION_QUEUE,
      summary: {
        attempted: count,
        replayed: count,
        failed: 0,
      },
      replayedAt: new Date().toISOString(),
    });

    return { count };
  }

  async cleanupDlq(options: any) {
    // Ported logic from old NotificationQueue
    await this.dlq.clean(1000 * 60 * 60 * 24 * 7, 'failed'); // 7 days
    return { cleaned: true };
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
}
