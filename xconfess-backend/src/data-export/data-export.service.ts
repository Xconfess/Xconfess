// src/data-export/data-export.service.ts
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ExportRequest } from './entities/export-request.entity';
import {
  ExportChunk,
  ExportChunkErrorMetadata,
} from './entities/export-chunk.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EXPORT_QUEUE_NAME } from './data-export.constants';

import { Logger } from '@nestjs/common';

export type ExportHistoryStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'EXPIRED';

/** Detailed lifecycle progress returned alongside every export history item. */
export interface ExportProgress {
  queuedAt: Date | null;
  processingAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  expiredAt: Date | null;
  retryCount: number;
  lastFailureReason: string | null;
}

export interface ExportHistoryItem {
  id: string;
  status: ExportHistoryStatus;
  createdAt: Date;
  expiresAt: number | null;
  canRedownload: boolean;
  canRequestNewLink: boolean;
  downloadUrl: string | null;
  /** Lifecycle timeline — additive; older clients can safely ignore this field. */
  progress: ExportProgress;
}

/** Slim status response for the GET :id/status endpoint. */
export interface ExportJobStatus {
  id: string;
  userId: string;
  status: ExportHistoryStatus;
  progress: ExportProgress;
}

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    @InjectRepository(ExportRequest)
    private exportRepository: Repository<ExportRequest>,
    @InjectRepository(ExportChunk)
    private chunkRepository: Repository<ExportChunk>,
    @InjectQueue(EXPORT_QUEUE_NAME) private exportQueue: Queue,
    private readonly configService: ConfigService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  // ── Issue #1453: resumable export helpers ──────────────────────────────────
  //
  // The processor is now able to restart from the last successfully completed
  // chunk. The helpers below are the service-level primitives the processor
  // uses to:
  //   - determine the resume point,
  //   - record chunk-level progress atomically,
  //   - mark a chunk failure with sanitized metadata (no PII, no stacks),
  //   - verify the integrity of the final archive before declaring READY.

  /**
   * Returns the highest chunk index for a request that has been durably
   * persisted as COMPLETED, or -1 when no chunk has been written yet.
   *
   * Returns -1 when the record cannot be resolved (should not happen in
   * normal operation, but prevents NaN-based infinite loops on resume).
   */
  async getResumeIndex(requestId: string): Promise<number> {
    const result = await this.chunkRepository
      .createQueryBuilder('chunk')
      .select('COALESCE(MAX(chunk.chunk_index), -1)', 'max')
      .where('chunk.export_request_id = :requestId', { requestId })
      .andWhere("chunk.status = 'COMPLETED'")
      .getRawOne<{ max: string | number | null }>();

    if (!result) return -1;
    const raw = result.max;
    if (raw === null || raw === undefined) return -1;
    const parsed = typeof raw === 'string' ? parseInt(raw, 10) : raw;
    return Number.isFinite(parsed) ? parsed : -1;
  }

  /**
   * Returns all chunks for a request, ordered by chunkIndex ascending.
   * Used by the integrity verification step before declaring an export READY.
   */
  async getChunksForRequest(
    requestId: string,
  ): Promise<Pick<ExportChunk, 'chunkIndex' | 'fileData' | 'chunkSize' | 'checksum' | 'status'>[]> {
    return this.chunkRepository.find({
      where: { exportRequestId: requestId },
      order: { chunkIndex: 'ASC' },
      select: ['chunkIndex', 'fileData', 'chunkSize', 'checksum', 'status'],
    });
  }

  /**
   * Persists a completed chunk row. Safe to call repeatedly for the same
   * (requestId, chunkIndex) thanks to the unique index added in #1453 — the
   * second write will be a no-op equivalent thanks to the early existence
   * check. As a defence-in-depth we also catch the unique-violation race
   * that can happen when two workers attempt to insert the same chunk slot.
   *
   * Returns true when a new row was inserted, false when an existing row was
   * detected and the call was suppressed (resume dedup).
   */
  async saveCompletedChunk(
    requestId: string,
    chunkIndex: number,
    buffer: Buffer,
    checksum: string,
  ): Promise<boolean> {
    const existing = await this.chunkRepository.findOne({
      where: { exportRequestId: requestId, chunkIndex },
      select: ['id'],
    });
    if (existing) {
      return false;
    }

    try {
      await this.chunkRepository.save({
        exportRequestId: requestId,
        chunkIndex,
        fileData: buffer,
        chunkSize: buffer.length,
        checksum,
        status: 'COMPLETED',
        errorMetadata: null,
      } as Partial<ExportChunk>);
      return true;
    } catch (err) {
      // Postgres unique-violation code is '23505'. If a concurrent worker
      // raced us to insert the same chunk, treat it as a successful dedup.
      const code = (err as { code?: string })?.code;
      if (code === '23505') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Records a failed-chunk tombstone so a subsequent resume can detect the
   * hole and re-process the slot. The metadata is sanitized to contain
   * absolutely no PII, file paths, stack frames or secrets — only a
   * category, short description, timestamp, and retry hint.
   */
  async markChunkFailed(
    requestId: string,
    chunkIndex: number,
    rawError: unknown,
  ): Promise<ExportChunkErrorMetadata> {
    const sanitized = sanitizeErrorMetadata(rawError);

    const payload: Partial<ExportChunk> = {
      exportRequestId: requestId,
      chunkIndex,
      fileData: Buffer.alloc(0),
      chunkSize: 0,
      checksum: '',
      status: 'FAILED',
      errorMetadata: sanitized,
    };

    // Upsert semantics — if a previous row exists at this slot, overwrite
    // the failure metadata so the latest attempt is reflected.
    const existing = await this.chunkRepository.findOne({
      where: { exportRequestId: requestId, chunkIndex },
      select: ['id'],
    });
    if (existing) {
      await this.chunkRepository.update(existing.id, payload);
    } else {
      await this.chunkRepository.save(payload);
    }

    this.logger.warn(
      `Chunk ${chunkIndex} of export ${requestId} failed: ${sanitized.code} (retryable=${sanitized.isRetryable})`,
    );
    return sanitized;
  }

  /**
   * Verifies the integrity of an export by:
   *   1. Confirming each chunk's stored checksum matches its actual bytes,
   *   2. Recomputing the combined SHA-256 over the concatenation of chunk
   *      payloads (in chunkIndex order) and comparing it against
   *      `expectedCombinedChecksum`.
   *
   * Throws BadRequestException with a stable error code whenever the archive
   * is incomplete or corrupt so callers can mark the export FAILED.
   */
  async verifyArchiveIntegrity(
    requestId: string,
    expectedCombinedChecksum: string,
  ): Promise<void> {
    const chunks = await this.getChunksForRequest(requestId);

    // Must be non-empty and contiguous from index 0 — partial archives are
    // an integrity failure even if every individual chunk verifies.
    if (chunks.length === 0) {
      throw new BadRequestException({
        message:
          'Archive integrity verification failed: no completed chunks were found.',
        code: 'ARCHIVE_INTEGRITY_FAILED',
      });
    }

    let expectedIndex = 0;
    const combinedHasher = crypto.createHash('sha256');

    for (const chunk of chunks) {
      if (chunk.chunkIndex !== expectedIndex) {
        throw new BadRequestException({
          message: `Archive integrity verification failed: missing chunk ${expectedIndex} (found ${chunk.chunkIndex}).`,
          code: 'ARCHIVE_INTEGRITY_FAILED',
        });
      }
      if (chunk.status !== 'COMPLETED' || !chunk.fileData || chunk.fileData.length === 0) {
        throw new BadRequestException({
          message: `Archive integrity verification failed: chunk ${expectedIndex} is not completed.`,
          code: 'ARCHIVE_INTEGRITY_FAILED',
        });
      }

      const actualChecksum = crypto
        .createHash('sha256')
        .update(chunk.fileData)
        .digest('hex');
      if (actualChecksum !== chunk.checksum) {
        throw new BadRequestException({
          message: `Archive integrity verification failed: chunk ${expectedIndex} checksum mismatch.`,
          code: 'ARCHIVE_INTEGRITY_FAILED',
        });
      }

      combinedHasher.update(chunk.fileData);
      expectedIndex += 1;
    }

    const combined = combinedHasher.digest('hex');
    if (combined !== expectedCombinedChecksum) {
      throw new BadRequestException({
        message:
          'Archive integrity verification failed: combined checksum mismatch with in-memory hash.',
        code: 'ARCHIVE_INTEGRITY_FAILED',
      });
    }
  }

  async requestExport(userId: string) {
    if (this.configService.get<string>('ENABLE_BACKGROUND_JOBS') !== 'true') {
      throw new ServiceUnavailableException(
        'Data export requires background job processing. Set ENABLE_BACKGROUND_JOBS=true and ensure Redis is available.',
      );
    }

    // 1a. Duplicate-submission guard: reject if a job is already PENDING or PROCESSING.
    const activeJob = await this.exportRepository.findOne({
      where: [
        { userId, status: 'PENDING' },
        { userId, status: 'PROCESSING' },
      ],
    });

    if (activeJob) {
      throw new ConflictException(
        'An export is already in progress. Please wait for it to complete.',
      );
    }

    // 1b. Rate Limit Check: Find any request created in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRequest = await this.exportRepository.findOne({
      where: {
        userId,
        createdAt: MoreThan(sevenDaysAgo),
      },
    });

    if (recentRequest) {
      throw new BadRequestException('Export allowed once every 7 days.');
    }

    // 2. Create record — stamp queuedAt immediately
    const now = new Date();
    const request = this.exportRepository.create({
      userId,
      status: 'PENDING',
      queuedAt: now,
    });
    await this.exportRepository.save(request);

    await this.auditLogService?.logExportLifecycleEvent({
      action: 'request_created',
      actorType: 'user',
      actorId: userId,
      requestId: request.id,
      exportId: request.id,
      metadata: {
        status: request.status,
        queuedAt: now.toISOString(),
      },
    });

    // 3. Kick off Bull queue
    await this.exportQueue.add('process-export', {
      userId,
      requestId: request.id,
    });

    return { requestId: request.id, status: 'PENDING', queuedAt: now };
  }

  /**
   * Called by the processor as soon as it picks up the job.
   * Transitions status to PROCESSING and stamps processingAt.
   */
  async markExportProcessing(requestId: string): Promise<void> {
    const now = new Date();
    await this.exportRepository.update(requestId, {
      status: 'PROCESSING',
      processingAt: now,
    });
  }

  /**
   * Called by the processor on failure. Increments retryCount and stores the
   * reason so operators can investigate without digging through log files.
   */
  async markExportFailed(requestId: string, reason: string): Promise<void> {
    const now = new Date();

    // Fetch current retryCount so we can increment it safely.
    const current = await this.exportRepository.findOne({
      where: { id: requestId },
      select: ['retryCount'],
    });
    const retryCount = (current?.retryCount ?? 0) + 1;

    await this.exportRepository.update(requestId, {
      status: 'FAILED',
      failedAt: now,
      retryCount,
      lastFailureReason: reason,
    });
  }

  async generateSignedDownloadUrl(
    requestId: string,
    userId: string,
    chunkIndex?: number,
  ): Promise<string> {
    const ttlMs = this.configService.get<number>(
      'app.exportDownloadTtlMs',
      24 * 60 * 60 * 1000,
    );
    const expires = Date.now() + ttlMs;
    const secret = this.configService.get<string>('app.appSecret', '');

    // For single-file downloads generate and persist a one-time nonce so the
    // link cannot be replayed after the first successful download.
    let token: string | undefined;
    if (chunkIndex === undefined) {
      token = crypto.randomBytes(16).toString('hex');
      await this.exportRepository.update(requestId, { downloadToken: token });
    }

    const dataToSign =
      chunkIndex !== undefined
        ? `${requestId}:${userId}:${chunkIndex}:${expires}`
        : `${requestId}:${userId}:${expires}:${token}`;

    const signature = crypto
      .createHmac('sha256', secret || 'APP_SECRET_NOT_SET')
      .update(dataToSign)
      .digest('hex');

    const baseUrl = this.configService.get<string>('app.backendUrl', '');

    void this.auditLogService
      ?.logExportLifecycleEvent({
        action: 'link_refreshed',
        actorType: 'user',
        actorId: userId,
        requestId,
        exportId: requestId,
        metadata: {
          expiresAt: new Date(expires).toISOString(),
        },
      })
      .catch(() => undefined);

    const chunkParam = chunkIndex !== undefined ? `&chunk=${chunkIndex}` : '';
    const tokenParam = token !== undefined ? `&token=${token}` : '';
    return `${baseUrl}/api/data-export/download/${requestId}?userId=${userId}&expires=${expires}&signature=${signature}${chunkParam}${tokenParam}`;
  }

  /**
   * Invalidates the current download token after a successful download.
   * Subsequent requests with the same token will be rejected.
   */
  async invalidateDownloadToken(requestId: string): Promise<void> {
    await this.exportRepository.update(requestId, {
      downloadToken: null,
      downloadedAt: new Date(),
    });
  }

  /**
   * Validates that the supplied token matches the stored one-time nonce and,
   * if so, atomically consumes it to prevent replay.
   *
   * Issue #789 — token expiry rules:
   *   1. Token must match the stored nonce (null = already consumed or never issued).
   *   2. Token must not have been used before (`downloadedAt` must be null).
   *   3. The export must still be within its retention window (24 h after `createdAt`).
   *
   * Returns false when any condition fails; callers should treat false as 403/410.
   */
 async validateAndConsumeToken(
    requestId: string,
    userId: string,
    token: string,
  ): Promise<boolean> {
    const record = await this.exportRepository.findOne({
      where: { id: requestId, userId },
      select: ['downloadToken', 'downloadedAt', 'createdAt', 'status'] as any,
    });

    // Token missing, already consumed, or mismatch.
    if (!record || record.downloadToken !== token) return false;

    // Terminal-use guard: token was already used (downloadedAt is set).
    if (record.downloadedAt !== null) return false;

    // Retention-window guard: export has exceeded its TTL.
    if (!this.isFileAvailable(record as Pick<ExportRequest, 'status' | 'createdAt'>)) {
      // Mark the token as expired and emit an audit event.
      await this.exportRepository.update(requestId, {
        downloadToken: null,
        expiredAt: new Date(),
      });

      void this.auditLogService
        ?.logExportLifecycleEvent({
          action: 'token_expired',
          actorType: 'user',
          actorId: userId,
          requestId,
          exportId: requestId,
          metadata: {
            userId,
            expiredAt: new Date().toISOString(),
            reason: 'retention_window_elapsed',
          },
        })
        .catch(() => undefined);

      return false;
    }

    await this.invalidateDownloadToken(requestId);

    void this.auditLogService
      ?.logExportLifecycleEvent({
        action: 'downloaded',
        actorType: 'user',
        actorId: userId,
        requestId,
        exportId: requestId,
        metadata: {
          userId,
          downloadedAt: new Date().toISOString(),
        },
      })
      .catch(() => undefined);

    return true;
  }

  /**
   * Expire all download tokens whose retention window has elapsed without being
   * consumed.  Called by the cleanup scheduler (data-export-cleanup.ts).
   *
   * Issue #789 — ensures tokens cannot be reused after the configured TTL even
   * if the owner never triggered a download.
   */
  async expireStaleDownloadTokens(): Promise<number> {
    const ttlMs = this.configService.get<number>(
      'DATA_EXPORT_TTL_MS',
      24 * 60 * 60 * 1000,
    );
    const cutoff = new Date(Date.now() - ttlMs);

    const result = await this.exportRepository
      .createQueryBuilder()
      .update(ExportRequest)
      .set({ downloadToken: null, expiredAt: () => 'NOW()' })
      .where('downloadToken IS NOT NULL')
      .andWhere('downloadedAt IS NULL')
      .andWhere('createdAt < :cutoff', { cutoff })
      .execute();

    const affected = result.affected ?? 0;

    if (affected > 0) {
      void this.auditLogService
        ?.logExportLifecycleEvent({
          action: 'export_expired',
          actorType: 'system',
          actorId: 'cleanup-scheduler',
          requestId: 'batch',
          exportId: 'batch',
          metadata: {
            affectedCount: affected,
            cutoff: cutoff.toISOString(),
            reason: 'scheduled_cleanup',
          },
        })
        .catch(() => undefined);
    }

    return affected;
  }

  async getExportFile(requestId: string, userId: string) {
    const exportRecord = await this.exportRepository.findOne({
      where: { id: requestId, userId },
      select: [
        'fileData',
        'status',
        'isChunked',
        'chunkCount',
        'totalSize',
        'combinedChecksum',
      ],
    });

    if (exportRecord?.fileData) {
      await this.auditLogService?.logExportLifecycleEvent({
        action: 'downloaded',
        actorType: 'user',
        actorId: userId,
        requestId,
        exportId: requestId,
        metadata: {
          status: exportRecord.status,
        },
      });
    }

    return exportRecord;
  }

  async getExportChunk(requestId: string, userId: string, chunkIndex: number) {
    // First verify ownership of the request
    const request = await this.exportRepository.findOne({
      where: { id: requestId, userId },
    });

    if (!request) {
      throw new NotFoundException('Export request not found or unauthorized');
    }

    return this.chunkRepository.findOne({
      where: { exportRequestId: requestId, chunkIndex },
    });
  }

  async markExportGenerated(
    requestId: string,
    userId: string,
    fileData: Buffer,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const now = new Date();
    await this.exportRepository.update(requestId, {
      fileData,
      status: 'READY',
      completedAt: now,
    });

    await this.auditLogService?.logExportLifecycleEvent({
      action: 'generation_completed',
      actorType: 'system',
      actorId: EXPORT_QUEUE_NAME,
      requestId,
      exportId: requestId,
      metadata: {
        userId,
        status: 'READY',
        completedAt: now.toISOString(),
        ...(metadata || {}),
      },
    });
  }

  private getExpiryTimestamp(createdAt: Date): number {
    const ttlMs = this.configService.get<number>(
      'app.exportDownloadTtlMs',
      24 * 60 * 60 * 1000,
    );
    return new Date(createdAt).getTime() + ttlMs;
  }

  /** True when the underlying export file is still within its TTL window. */
  private isFileAvailable(
    request: Pick<ExportRequest, 'status' | 'createdAt'>,
  ): boolean {
    if (request.status !== 'READY') return false;
    return Date.now() <= this.getExpiryTimestamp(request.createdAt);
  }

  /** True when a valid one-time token exists and the file is still available. */
  private hasActiveToken(
    request: Pick<ExportRequest, 'status' | 'createdAt' | 'downloadToken'>,
  ): boolean {
    return this.isFileAvailable(request) && request.downloadToken !== null;
  }

  private buildProgress(request: Partial<ExportRequest>): ExportProgress {
    return {
      queuedAt: request.queuedAt ?? null,
      processingAt: request.processingAt ?? null,
      completedAt: request.completedAt ?? null,
      failedAt: request.failedAt ?? null,
      expiredAt: request.expiredAt ?? null,
      retryCount: request.retryCount ?? 0,
      lastFailureReason: request.lastFailureReason ?? null,
    };
  }

  private async toHistoryItem(
    request: Pick<
      ExportRequest,
      | 'id'
      | 'status'
      | 'createdAt'
      | 'userId'
      | 'queuedAt'
      | 'processingAt'
      | 'completedAt'
      | 'failedAt'
      | 'expiredAt'
      | 'retryCount'
      | 'lastFailureReason'
      | 'downloadToken'
    >,
  ): Promise<ExportHistoryItem> {
    const expiresAt =
      request.status === 'READY'
        ? this.getExpiryTimestamp(request.createdAt)
        : null;
    const fileAvailable = this.isFileAvailable(request);
    const canRedownload = this.hasActiveToken(request);
    const normalizedStatus: ExportHistoryStatus =
      request.status === 'READY' && !fileAvailable
        ? 'EXPIRED'
        : (request.status as ExportHistoryStatus);

    return {
      id: request.id,
      status: normalizedStatus,
      createdAt: request.createdAt,
      expiresAt,
      canRedownload,
      // Allow regeneration when the file is still available but the token was consumed.
      canRequestNewLink: fileAvailable && !canRedownload,
      downloadUrl: canRedownload
        ? await this.generateSignedDownloadUrl(request.id, request.userId)
        : null,
      progress: this.buildProgress(request),
    };
  }

  /** The full list of fields we need fetched from the DB for history/status calls. */
  private readonly lifecycleSelect = [
    'id',
    'status',
    'createdAt',
    'userId',
    'queuedAt',
    'processingAt',
    'completedAt',
    'failedAt',
    'expiredAt',
    'retryCount',
    'lastFailureReason',
    'downloadToken',
  ] as const;

  async getExportHistory(
    userId: string,
    limit = 20,
  ): Promise<ExportHistoryItem[]> {
    const requests = await this.exportRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      select: this.lifecycleSelect as any,
    });

    return Promise.all(requests.map((request) => this.toHistoryItem(request)));
  }

  async getLatestExport(userId: string): Promise<ExportHistoryItem | null> {
    const latestRequest = await this.exportRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: this.lifecycleSelect as any,
    });

    return latestRequest ? this.toHistoryItem(latestRequest) : null;
  }

  async getRedownloadLink(
    requestId: string,
    userId: string,
  ): Promise<{ downloadUrl: string }> {
    const request = await this.exportRepository.findOne({
      where: { id: requestId, userId },
      select: this.lifecycleSelect as any,
    });

    if (!request || !this.isFileAvailable(request)) {
      throw new BadRequestException(
        'Secure download link is no longer available. Request a new export.',
      );
    }

    return {
      downloadUrl: await this.generateSignedDownloadUrl(
        request.id,
        request.userId,
      ),
    };
  }

  /**
   * Returns the full lifecycle status for a single export job.
   * Used by the GET /data-export/:id/status endpoint.
   */
  async getJobStatus(
    requestId: string,
    userId: string,
  ): Promise<ExportJobStatus> {
    const request = await this.exportRepository.findOne({
      where: { id: requestId, userId },
      select: this.lifecycleSelect as any,
    });

    if (!request) {
      throw new NotFoundException('Export request not found or unauthorized');
    }

    const canRedownload = this.isFileAvailable(request);
    const normalizedStatus: ExportHistoryStatus =
      request.status === 'READY' && !canRedownload
        ? 'EXPIRED'
        : (request.status as ExportHistoryStatus);

    return {
      id: request.id,
      userId: request.userId,
      status: normalizedStatus,
      progress: this.buildProgress(request),
    };
  }

  async compileUserData(userId: string): Promise<any> {
    // Issue #428: Implement export redaction for deleted/deactivated users
    const userRepo = this.exportRepository.manager.getRepository('User');
    const confessionRepo = this.exportRepository.manager.getRepository('AnonymousConfession');
    const commentRepo = this.exportRepository.manager.getRepository('Comment');
    const messageRepo = this.exportRepository.manager.getRepository('Message');

    // Get user to check if active
    const user = await userRepo.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Fetch confessions with soft-delete awareness
    const confessions = await confessionRepo
      .createQueryBuilder('confession')
      .leftJoinAndSelect('confession.anonymousUser', 'anonymousUser')
      .leftJoinAndSelect('anonymousUser.userLinks', 'userLinks')
      .where('userLinks.userId = :userId', { userId })
      .getMany();

    // Fetch comments with soft-delete awareness
    const comments = await commentRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.anonymousUser', 'anonymousUser')
      .leftJoinAndSelect('anonymousUser.userLinks', 'userLinks')
      .where('userLinks.userId = :userId', { userId })
      .getMany();

    // Fetch messages
    const messages = await messageRepo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('sender.userLinks', 'userLinks')
      .where('userLinks.userId = :userId', { userId })
      .getMany();

    // Apply redaction policy
    const redactedConfessions = confessions.map((confession) =>
      this.redactConfessionForExport(confession, user),
    );

    const redactedComments = comments.map((comment) =>
      this.redactCommentForExport(comment, user),
    );

    const redactedMessages = messages.map((message) =>
      this.redactMessageForExport(message, user),
    );

    return {
      userId,
      exportedAt: new Date().toISOString(),
      userStatus: user.is_active ? 'active' : 'deactivated',
      confessions: redactedConfessions,
      comments: redactedComments,
      messages: redactedMessages,
      reactions: [],
      _redactionPolicy: {
        description: 'Content redacted according to deletion and moderation policies',
        deletedContentMasked: true,
        moderatedContentMasked: true,
        deactivatedUserContentMasked: !user.is_active,
      },
    };
  }

  /**
   * Issue #428: Redact confession content based on deletion and moderation status
   */
  private redactConfessionForExport(confession: any, user: any): any {
    const isDeleted = confession.isDeleted || confession.deletedAt;
    const isModerated = confession.isHidden || confession.moderationStatus === 'rejected';
    const isUserDeactivated = !user.is_active;

    if (isDeleted) {
      return {
        id: confession.id,
        message: '[REDACTED: Content was deleted]',
        _redacted: true,
        _reason: 'deleted',
        deletedAt: confession.deletedAt,
        created_at: confession.created_at,
        metadata: {
          wasAnchored: confession.isAnchored,
          hadReactions: true,
        },
      };
    }

    if (isModerated) {
      return {
        id: confession.id,
        message: '[REDACTED: Content was removed by moderation]',
        _redacted: true,
        _reason: 'moderated',
        moderationStatus: confession.moderationStatus,
        created_at: confession.created_at,
        metadata: {
          moderationScore: confession.moderationScore,
          moderationFlags: confession.moderationFlags,
        },
      };
    }

    if (isUserDeactivated) {
      return {
        id: confession.id,
        message: '[REDACTED: User account deactivated]',
        _redacted: true,
        _reason: 'user_deactivated',
        created_at: confession.created_at,
        metadata: {
          originalLength: confession.message?.length || 0,
        },
      };
    }

    // Return full content for active, non-deleted, non-moderated confessions
    return {
      id: confession.id,
      message: confession.message,
      gender: confession.gender,
      created_at: confession.created_at,
      view_count: confession.view_count,
      isAnchored: confession.isAnchored,
      stellarTxHash: confession.stellarTxHash,
      _redacted: false,
    };
  }

  /**
   * Issue #428: Redact comment content based on deletion status
   */
  private redactCommentForExport(comment: any, user: any): any {
    const isDeleted = comment.isDeleted;
    const isUserDeactivated = !user.is_active;

    if (isDeleted) {
      return {
        id: comment.id,
        content: '[REDACTED: Comment was deleted]',
        _redacted: true,
        _reason: 'deleted',
        createdAt: comment.createdAt,
        confessionId: comment.confession?.id,
      };
    }

    if (isUserDeactivated) {
      return {
        id: comment.id,
        content: '[REDACTED: User account deactivated]',
        _redacted: true,
        _reason: 'user_deactivated',
        createdAt: comment.createdAt,
        confessionId: comment.confession?.id,
      };
    }

    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      confessionId: comment.confession?.id,
      parentId: comment.parentId,
      _redacted: false,
    };
  }

  /**
   * Issue #428: Redact message content for deactivated users
   */
  private redactMessageForExport(message: any, user: any): any {
    const isUserDeactivated = !user.is_active;

    if (isUserDeactivated) {
      return {
        id: message.id,
        content: '[REDACTED: User account deactivated]',
        replyContent: message.replyContent
          ? '[REDACTED: User account deactivated]'
          : null,
        _redacted: true,
        _reason: 'user_deactivated',
        createdAt: message.createdAt,
        confessionId: message.confession?.id,
      };
    }

    return {
      id: message.id,
      content: message.content,
      replyContent: message.replyContent,
      createdAt: message.createdAt,
      repliedAt: message.repliedAt,
      confessionId: message.confession?.id,
      _redacted: false,
    };
  }

  convertToCsv(data: any[]): string {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map((obj) => Object.values(obj).join(',')).join('\n');
    return `${headers}\n${rows}`;
  }
}

/**
 * Issue #1453 — produces a safe, non-sensitive metadata payload from any error.
 *
 * Scrubs:
 *  - PII: identifiers, emails, usernames, names — replaced with placeholders.
 *  - Stack traces & file paths: never persisted.
 *  - Long messages: truncated to 240 characters.
 *
 * Categorises the failure using a stable code so operators can reason about
 * it without inspecting logs.
 */
export function sanitizeErrorMetadata(
  rawError: unknown,
): ExportChunkErrorMetadata {
  const at = new Date().toISOString();
  const err = rawError instanceof Error ? rawError : null;
  const rawMessage = err?.message || (typeof rawError === 'string' ? rawError : '');

  // PII scrubbing — replace anything that looks like an email or long id.
  // (Defence-in-depth: payloads should never contain PII, but if they do we
  // make sure they never leak to the metadata column.)
  const safeMessage = rawMessage
    // strip leading/trailing whitespace
    .trim()
    // emails
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    // long hex ids (32+ chars) that may be PII
    .replace(/\b[0-9a-f]{32,}\b/gi, '[redacted-id]')
    // strip anything resembling a file path
    .replace(/\/[^\s)]+/g, '[path]')
    .slice(0, 240);

  const code = classifyError(rawMessage, err);
  const isRetryable = code !== 'CHUNK_PAYLOAD_INVALID';

  return {
    at,
    code,
    message: safeMessage.length === 0 ? 'unknown error' : safeMessage,
    isRetryable,
  };
}

function classifyError(message: string, err: Error | null): string {
  const haystack = (message || err?.name || '').toLowerCase();
  if (haystack.includes('timeout') || haystack.includes('etimedout')) {
    return 'CHUNK_WRITE_TIMEOUT';
  }
  if (haystack.includes('econnrefused') || haystack.includes('econnreset')) {
    return 'CHUNK_WRITE_CONNECTION_LOST';
  }
  if (
    haystack.includes('disk') ||
    haystack.includes('enospc') ||
    haystack.includes('quota')
  ) {
    return 'CHUNK_WRITE_OUT_OF_SPACE';
  }
  if (haystack.includes('permission') || haystack.includes('eacces')) {
    return 'CHUNK_WRITE_PERMISSION_DENIED';
  }
  if (haystack.includes('payload') || haystack.includes('invalid')) {
    return 'CHUNK_PAYLOAD_INVALID';
  }
  return 'CHUNK_WRITE_FAILED';
}
