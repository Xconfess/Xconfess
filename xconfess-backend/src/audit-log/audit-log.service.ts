import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditActionType } from './audit-log.entity';
import { AuditLogRedactionService } from './audit-log-redaction.service';

export interface AuditLogContext {
  userId?: string | number | null;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  actor?: AuditActor;
}

export type AuditActorType = 'admin' | 'user' | 'system' | 'webhook';

export interface AuditActor {
  type: AuditActorType;
  id: string;
  userId?: string | null;
  label?: string;
  source?: string | null;
}

export interface CreateAuditLogDto {
  actionType: AuditActionType;
  metadata?: Record<string, unknown>;
  context?: AuditLogContext;
}

export interface TemplateRolloutSourceMetadata {
  reason?: string;
  correlationId?: string;
  sourceEndpoint?: string;
  sourceMethod?: string;
}

export interface TemplateRolloutDiffRecord {
  templateKey: string;
  templateVersion?: string;
  changeType:
    | 'state_transition'
    | 'active_version_switch'
    | 'canary_update'
    | 'kill_switch_toggle'
    | 'fallback_activation';
  actorId: string;
  actorType?: AuditActorType;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  source?: TemplateRolloutSourceMetadata;
}

export type ExportLifecycleAction =
  | 'request_created'
  | 'generation_completed'
  | 'link_refreshed'
  | 'downloaded'
  | 'download_failed'
  | 'token_expired'
  | 'export_expired';

export type ExportActorType = AuditActorType;

export interface ExportLifecycleAuditRecord {
  action: ExportLifecycleAction;
  requestId: string;
  exportId?: string;
  actorType: ExportActorType;
  actorId?: string | null;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
  context?: AuditLogContext;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly redaction: AuditLogRedactionService,
  ) {}

  private toNullableUserId(value?: string | number | null): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const normalized =
      typeof value === 'number' ? value : Number.parseInt(value, 10);

    if (!Number.isInteger(normalized)) {
      return null;
    }

    return normalized;
  }

  private extractEntityId(metadata?: Record<string, any>): string | null {
    if (!metadata) {
      return null;
    }

    const candidates = [
      metadata.entityId,
      metadata.reportId,
      metadata.commentId,
      metadata.confessionId,
      metadata.exportId,
      metadata.requestId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }

    return null;
  }

  private extractMetadataString(
    metadata: Record<string, unknown> | undefined,
    key: string,
  ): string | null {
    const value = metadata?.[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  /**
   * Log a sensitive action to the audit log
   * Includes error handling to prevent logging failures from breaking the application
   */
  async log(dto: CreateAuditLogDto): Promise<void> {
    try {
      const actor = this.resolveActor(dto);
      const templateKey = this.extractMetadataString(
        dto.metadata,
        'templateKey',
      );
      const templateVersion = this.extractMetadataString(
        dto.metadata,
        'templateVersion',
      );

      const rawMetadata = {
        ...(dto.metadata || {}),
        ...(actor
          ? {
              actorType: actor.type,
              actorId: actor.id,
              actorUserId: actor.userId || null,
              ...(actor.label ? { actorLabel: actor.label } : {}),
              ...(actor.source ? { actorSource: actor.source } : {}),
            }
          : {}),
        ...(dto.context?.requestId
          ? { requestId: dto.context.requestId }
          : {}),
        ...(templateKey && templateVersion
          ? {
              templateKey,
              templateVersion,
            }
          : {}),
      };

      let safeMetadata: Record<string, unknown> | null = rawMetadata;
      try {
        safeMetadata = this.redaction.redactMetadata(rawMetadata);
      } catch (redactionError: unknown) {
        this.logger.warn(
          `Audit metadata redaction failed, falling back to raw metadata: ${redactionError instanceof Error ? redactionError.message : 'unknown error'}`,
        );
      }

      const auditLog = this.auditLogRepository.create({
        adminId: this.toNullableUserId(dto.context?.userId || null),
        action: dto.actionType,
        entityType:
          typeof dto.metadata?.entityType === 'string'
            ? dto.metadata.entityType
            : null,
        entityId: this.extractEntityId(dto.metadata),
        metadata: safeMetadata,
        notes: null,
        ipAddress: dto.context?.ipAddress || null,
        userAgent: dto.context?.userAgent || null,
        requestId: dto.context?.requestId || null,
      });

      await this.auditLogRepository.save(auditLog);

      this.logger.log(
        `Audit log created: ${dto.actionType} by ${actor?.type || 'anonymous'} ${actor?.id || dto.context?.userId || 'anonymous'}`,
      );
    } catch (error: unknown) {
      // Log the error but don't throw to prevent disrupting the main operation
      this.logger.error(
        `Failed to create audit log for action ${dto.actionType}: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Log confession deletion
   */
  async logConfessionDelete(
    confessionId: string,
    userId: string,
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.CONFESSION_DELETED,
      metadata: {
        confessionId,
        entityType: 'confession',
        entityId: confessionId,
        deletedAt: new Date().toISOString(),
      },
      context: { ...context, userId },
    });
  }

/**
 * Log a moderation item's state transition (pending/flagged/escalated/
 * resolved/hidden/rejected), including actor, previous/next state, and reason.
 */
async logModerationStateTransition(
  moderationLogId: string,
  from: string,
  to: string,
  actorId: string,
  reason: string,
  metadata?: { confessionId?: string; notes?: string },
  context?: AuditLogContext,
): Promise<void> {
  await this.log({
    actionType: AuditActionType.MODERATION_STATE_TRANSITION,
    metadata: {
      entityType: 'moderation_log',
      entityId: moderationLogId,
      confessionId: metadata?.confessionId,
      previousState: from,
      nextState: to,
      reason,
      notes: metadata?.notes,
      transitionedAt: new Date().toISOString(),
    },
    context: {
      ...context,
      userId: actorId,
      actor: this.createActor('admin', actorId),
    },
  });
}

  /**
   * Log comment deletion
   */
  async logCommentDelete(
    commentId: string,
    confessionId: string,
    userId: string,
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.COMMENT_DELETED,
      metadata: {
        commentId,
        confessionId,
        entityType: 'comment',
        entityId: commentId,
        deletedAt: new Date().toISOString(),
      },
      context: { ...context, userId },
    });
  }

  /**
   * Log failed login attempt
   */
  async logFailedLogin(
    identifier: string,
    reason: string,
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.FAILED_LOGIN,
      metadata: {
        identifier,
        reason,
        attemptedAt: new Date().toISOString(),
      },
      context,
    });
  }

  /**
   * Log report creation
   */
  async logReport(
    reportId: string,
    targetType: 'confession' | 'comment',
    targetId: string,
    reporterId: string,
    reason: string,
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.REPORT_CREATED,
      metadata: {
        reportId,
        targetType,
        targetId,
        entityType: targetType,
        entityId: targetId,
        reason,
        reportedAt: new Date().toISOString(),
      },
      context: { ...context, userId: reporterId },
    });
  }

  /**
   * Log report resolution
   */
  async logReportResolved(
    reportId: string,
    adminId: string,
    metadata: {
      previousStatus?: string;
      reason?: string;
      confessionId?: string;
      resolvedBy?: string;
    },
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.REPORT_RESOLVED,
      metadata: {
        reportId,
        entityType: 'report',
        entityId: reportId,
        ...metadata,
        resolvedAt: new Date().toISOString(),
      },
      context: {
        ...context,
        userId: adminId,
        actor: this.createActor('admin', adminId),
      },
    });
  }

  /**
   * Log report dismissal
   */
  async logReportDismissed(
    reportId: string,
    adminId: string,
    metadata: {
      previousStatus?: string;
      reason?: string;
      confessionId?: string;
      dismissedBy?: string;
    },
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.REPORT_DISMISSED,
      metadata: {
        reportId,
        entityType: 'report',
        entityId: reportId,
        ...metadata,
        dismissedAt: new Date().toISOString(),
      },
      context: {
        ...context,
        userId: adminId,
        actor: this.createActor('admin', adminId),
      },
    });
  }

  /**
   * Log notification DLQ replay actions performed by operators/admins.
   */
  async logNotificationDlqReplay(
    adminId: string,
    metadata: {
      replayType: 'single' | 'bulk';
      queue: string;
      operationId?: string;
      jobId?: string;
      targetJobIds?: string[];
      targetJobs?: Array<Record<string, unknown>>;
      filters?: Record<string, any>;
      summary?: {
        attempted: number;
        replayed: number;
        failed: number;
        deduplicated?: number;
        removed?: number;
        noOp?: boolean;
      };
      outcomes?: Array<Record<string, unknown>>;
      reason?: string | null;
      replayedAt?: string;
    },
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.NOTIFICATION_DLQ_REPLAY,
      metadata: {
        entityType: 'notification_dlq',
        ...metadata,
        replayedAt: metadata.replayedAt || new Date().toISOString(),
      },
      context: {
        ...context,
        userId: adminId,
        actor: this.createActor('admin', adminId),
      },
    });
  }

  async logNotificationDlqCleanup(
    adminId: string,
    metadata: {
      cleanupType: 'bulk' | 'retention';
      queue: string;
      operationId?: string;
      targetJobIds?: string[];
      targetJobs?: Array<Record<string, unknown>>;
      filters?: Record<string, any>;
      summary?: {
        attempted: number;
        removed: number;
        failed: number;
        noOp?: boolean;
      };
      outcomes?: Array<Record<string, unknown>>;
      reason?: string | null;
      cleanedAt?: string;
      retentionDays?: number;
      batchSize?: number;
      dryRun?: boolean;
    },
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.NOTIFICATION_DLQ_CLEANUP,
      metadata: {
        entityType: 'notification_dlq',
        ...metadata,
        cleanedAt: metadata.cleanedAt || new Date().toISOString(),
      },
      context: {
        ...context,
        userId: adminId,
        actor: this.createActor('admin', adminId),
      },
    });
  }

  /**
   * Log a single summary entry for an export-retention cleanup run
   * (dry-run or real), mirroring logNotificationDlqCleanup.
   */
  async logExportRetentionCleanup(
    metadata: {
      dryRun: boolean;
      retentionDays: number;
      cutoff: string;
      summary: {
        eligibleCount: number;
        expiredCount: number;
        chunkCount: number;
        statusCounts: Record<string, number>;
        requestIds: string[];
        omittedRequestIds: number;
      };
      cleanedAt?: string;
    },
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.EXPORT_RETENTION_CLEANUP,
      metadata: {
        entityType: 'data_export_retention',
        ...metadata,
        cleanedAt: metadata.cleanedAt || new Date().toISOString(),
      },
      context: {
        ...context,
        actor: this.createActor('system', 'retention-cleanup-scheduler'),
      },
    });
  }

  /**
   * Log an admin-initiated CSV export (frontend-driven)
   */
  async logAdminCsvExport(
    adminId: string | number,
    record: {
      label: string;
      requestId?: string | null;
      rowCount?: number | null;
      filters?: Record<string, unknown> | null;
    },
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.ADMIN_CSV_EXPORT,
      metadata: {
        entityType: 'admin_csv_export',
        label: record.label,
        requestId: record.requestId || null,
        rowCount: record.rowCount ?? null,
        filters: record.filters || null,
        exportedAt: new Date().toISOString(),
      },
      context: {
        ...context,
        userId: this.toNullableUserId(String(adminId)),
      },
    });
  }

  private mapExportActionType(action: ExportLifecycleAction): AuditActionType {
    switch (action) {
      case 'request_created':
        return AuditActionType.EXPORT_REQUEST_CREATED;
      case 'generation_completed':
        return AuditActionType.EXPORT_GENERATION_COMPLETED;
      case 'link_refreshed':
        return AuditActionType.EXPORT_LINK_REFRESHED;
      case 'downloaded':
        return AuditActionType.EXPORT_DOWNLOADED;
      case 'download_failed':
        return AuditActionType.EXPORT_DOWNLOAD_FAILED;
      case 'token_expired':
        return AuditActionType.EXPORT_TOKEN_EXPIRED;
      case 'export_expired':
        return AuditActionType.EXPORT_EXPIRED;
      default:
        return AuditActionType.EXPORT_REQUEST_CREATED;
    }
  }

  async logExportLifecycleEvent(
    record: ExportLifecycleAuditRecord,
  ): Promise<void> {
    const occurredAt = record.occurredAt || new Date().toISOString();
    const exportId = record.exportId || record.requestId;
    const actorUserId =
      record.actorType === 'user' || record.actorType === 'admin'
        ? record.actorId || record.context?.userId || null
        : null;

    await this.log({
      actionType: this.mapExportActionType(record.action),
      metadata: {
        ...(record.metadata || {}),
        entityType: 'data_export',
        entityId: exportId,
        exportId,
        requestId: record.requestId,
        actorType: record.actorType,
        actorId: record.actorId || null,
        lifecycleAction: record.action,
        occurredAt,
      },
      context: {
        ...record.context,
        userId: this.toNullableUserId(record.context?.userId ?? actorUserId),
        actor: this.createActor(
          record.actorType,
          record.actorId || record.action,
          {
            userId: actorUserId,
          },
        ),
      },
    });
  }

  private buildRolloutDiff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { before: unknown; after: unknown }> {
    const keys = new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]);
    const diff: Record<string, { before: unknown; after: unknown }> = {};

    for (const key of keys) {
      const beforeValue = before?.[key];
      const afterValue = after?.[key];
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        diff[key] = {
          before: beforeValue,
          after: afterValue,
        };
      }
    }

    return diff;
  }

  async logTemplateRolloutDiff(
    record: TemplateRolloutDiffRecord,
    context?: AuditLogContext,
  ): Promise<void> {
    const correlationId = record.source?.correlationId || context?.requestId;
    const diff = this.buildRolloutDiff(record.before, record.after);
    const actorUserId = context?.userId ?? record.actorId;

    await this.log({
      actionType: AuditActionType.TEMPLATE_ROLLOUT_DIFF_RECORDED,
      metadata: {
        entityType: 'template_rollout',
        entityId: record.templateVersion
          ? `${record.templateKey}:${record.templateVersion}`
          : record.templateKey,
        templateKey: record.templateKey,
        templateVersion: record.templateVersion || null,
        changeType: record.changeType,
        actorId: record.actorId,
        reason: record.source?.reason || null,
        correlationId: correlationId || null,
        sourceEndpoint: record.source?.sourceEndpoint || null,
        sourceMethod: record.source?.sourceMethod || null,
        before: record.before,
        after: record.after,
        diff,
        changedAt: new Date().toISOString(),
      },
      context: {
        ...context,
        userId: this.toNullableUserId(actorUserId),
        actor: this.createActor(record.actorType || 'admin', record.actorId, {
          userId: actorUserId,
          source: record.source?.sourceEndpoint || null,
        }),
      },
    });
  }

  /**
   * Log template state transition
   */
  async logTemplateStateTransition(
    templateKey: string,
    version: string,
    from: string,
    to: string,
    adminId: string,
    reason?: string,
    source?: TemplateRolloutSourceMetadata,
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.TEMPLATE_STATE_TRANSITION,
      metadata: {
        templateKey,
        templateVersion: version,
        from,
        to,
        reason,
        entityType: 'template_version',
        entityId: `${templateKey}:${version}`,
        transitionedAt: new Date().toISOString(),
      },
      context: {
        ...context,
        userId: adminId,
        actor: this.createActor('admin', adminId),
      },
    });

    await this.logTemplateRolloutDiff(
      {
        templateKey,
        templateVersion: version,
        changeType: 'state_transition',
        actorId: adminId,
        actorType: 'admin',
        before: { lifecycleState: from },
        after: { lifecycleState: to },
        source: {
          reason,
          correlationId: source?.correlationId,
          sourceEndpoint: source?.sourceEndpoint,
          sourceMethod: source?.sourceMethod,
        },
      },
      context,
    );
  }

  /**
   * Log template killswitch toggle
   */
  async logTemplateKillswitchToggle(
    adminId: string,
    enabled: boolean,
    templateKey?: string,
    reason?: string,
    source?: TemplateRolloutSourceMetadata,
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.TEMPLATE_ROLLOUT_KILLSWITCH,
      metadata: {
        enabled,
        templateKey: templateKey || 'global',
        reason,
        entityType: 'template_config',
        entityId: templateKey || 'global',
        toggledAt: new Date().toISOString(),
      },
      context: {
        ...context,
        userId: adminId,
        actor: this.createActor('admin', adminId),
      },
    });

    await this.logTemplateRolloutDiff(
      {
        templateKey: templateKey || 'global',
        changeType: 'kill_switch_toggle',
        actorId: adminId,
        actorType: 'admin',
        before: { killSwitchEnabled: !enabled },
        after: { killSwitchEnabled: enabled },
        source: {
          reason,
          correlationId: source?.correlationId,
          sourceEndpoint: source?.sourceEndpoint,
          sourceMethod: source?.sourceMethod,
        },
      },
      context,
    );
  }

  /**
   * Log template fallback activation
   */
  async logTemplateFallbackActivated(
    templateKey: string,
    failedVersion: string,
    fallbackVersion: string,
    reason: string,
    source?: TemplateRolloutSourceMetadata,
    context?: AuditLogContext,
  ): Promise<void> {
    await this.log({
      actionType: AuditActionType.TEMPLATE_FALLBACK_ACTIVATED,
      metadata: {
        templateKey,
        failedVersion,
        fallbackVersion,
        reason,
        entityType: 'template_version',
        entityId: `${templateKey}:${failedVersion}`,
        activatedAt: new Date().toISOString(),
      },
      context,
    });

    await this.logTemplateRolloutDiff(
      {
        templateKey,
        templateVersion: failedVersion,
        changeType: 'fallback_activation',
        actorId: String(
          context?.actor?.id || context?.userId || 'template-fallback',
        ),
        actorType:
          context?.actor?.type || (context?.userId ? 'admin' : 'system'),
        before: { activeVersion: failedVersion },
        after: { activeVersion: fallbackVersion },
        source: {
          reason,
          correlationId: source?.correlationId,
          sourceEndpoint: source?.sourceEndpoint,
          sourceMethod: source?.sourceMethod,
        },
      },
      context,
    );
  }

  /**
   * Find audit logs by entity (backward compatible with the requested feature)
   */
  async findByEntity(
    entityType: string,
    entityId: string,
  ): Promise<AuditLog[]> {
    try {
      // Since we store entity info in metadata, we need to query the JSONB field
      const logs = await this.auditLogRepository
        .createQueryBuilder('audit_log')
        .leftJoinAndSelect('audit_log.admin', 'admin')
        .where('audit_log.entityType = :entityType', { entityType })
        .andWhere('audit_log.entityId = :entityId', { entityId })
        .orderBy('audit_log.createdAt', 'DESC')
        .getMany();

      return logs;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to find audit logs by entity: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Find audit logs by user
   */
  async findByUser(userId: string | number): Promise<AuditLog[]> {
    const normalizedUserId = this.toNullableUserId(userId);
    if (normalizedUserId === null) {
      return [];
    }

    try {
      return this.auditLogRepository.find({
        where: { adminId: normalizedUserId },
        order: { createdAt: 'DESC' },
        relations: ['admin'],
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to find audit logs by user: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async findAll(options: {
    userId?: string | number;
    actor?: string;
    actorId?: string;
    actorType?: string;
    actionType?: AuditActionType;
    entityType?: string;
    entityId?: string;
    requestId?: string;
    exportId?: string;
    templateKey?: string;
    templateVersion?: string;
    search?: string;
    sortBy?: 'createdAt' | 'actor' | 'action' | 'target';
    sortOrder?: 'ASC' | 'DESC';
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    try {
      const query = this.auditLogRepository
        .createQueryBuilder('audit_log')
        .leftJoinAndSelect('audit_log.admin', 'admin');

      if (options.userId) {
        const normalizedUserId = this.toNullableUserId(options.userId);
        if (normalizedUserId === null) {
          return {
            logs: [],
            total: 0,
            limit: options.limit || 100,
            offset: options.offset || 0,
          };
        }
        query.andWhere('audit_log.admin_id = :userId', {
          userId: normalizedUserId,
        });
      }

      if (options.actor) {
        const actor = options.actor.trim();
        if (actor) {
          const normalizedActorId = this.toNullableUserId(actor);
          query.andWhere(
            `(${[
              'admin.username ILIKE :actorLike',
              "audit_log.metadata->>'actorLabel' ILIKE :actorLike",
              "audit_log.metadata->>'actorId' ILIKE :actorLike",
              normalizedActorId === null
                ? null
                : 'audit_log.admin_id = :actorId',
            ]
              .filter(Boolean)
              .join(' OR ')})`,
            {
              actorLike: `%${actor}%`,
              actorId: normalizedActorId,
            },
          );
        }
      }

      if (options.actorId) {
        const normalizedActorId = this.toNullableUserId(options.actorId);
        query.andWhere(
          normalizedActorId === null
            ? "audit_log.metadata->>'actorId' = :actorIdRaw"
            : "(audit_log.admin_id = :actorId OR audit_log.metadata->>'actorId' = :actorIdRaw)",
          {
            actorId: normalizedActorId,
            actorIdRaw: options.actorId,
          },
        );
      }

      if (options.actorType) {
        query.andWhere("audit_log.metadata->>'actorType' = :actorType", {
          actorType: options.actorType,
        });
      }

      if (options.actionType) {
        query.andWhere('audit_log.action = :actionType', {
          actionType: options.actionType,
        });
      }

      if (options.entityType) {
        query.andWhere('audit_log.entity_type = :entityType', {
          entityType: options.entityType,
        });
      }

      if (options.entityId) {
        query.andWhere('audit_log.entity_id = :entityId', {
          entityId: options.entityId,
        });
      }

      if (options.requestId) {
        query.andWhere(
          "(audit_log.request_id = :requestId OR audit_log.metadata->>'requestId' = :requestId)",
          { requestId: options.requestId },
        );
      }

      if (options.exportId) {
        query.andWhere(
          "(audit_log.metadata->>'exportId' = :exportId OR audit_log.metadata->>'entityId' = :exportId)",
          {
            exportId: options.exportId,
          },
        );
      }

      if (options.templateKey) {
        query.andWhere("audit_log.metadata->>'templateKey' = :templateKey", {
          templateKey: options.templateKey,
        });
      }

      if (options.templateVersion) {
        query.andWhere(
          "audit_log.metadata->>'templateVersion' = :templateVersion",
          {
            templateVersion: options.templateVersion,
          },
        );
      }

      if (options.search) {
        const search = options.search.trim();
        if (search) {
          query.andWhere(
            `(${[
              'audit_log.action::text ILIKE :search',
              'audit_log.entity_type ILIKE :search',
              'audit_log.entity_id ILIKE :search',
              'audit_log.notes ILIKE :search',
              'audit_log.request_id ILIKE :search',
              'admin.username ILIKE :search',
              'audit_log.metadata::text ILIKE :search',
            ].join(' OR ')})`,
            { search: `%${search}%` },
          );
        }
      }

      if (options.startDate) {
        query.andWhere('audit_log.createdAt >= :startDate', {
          startDate: options.startDate,
        });
      }

      if (options.endDate) {
        query.andWhere('audit_log.createdAt <= :endDate', {
          endDate: options.endDate,
        });
      }

      const sortOrder = options.sortOrder === 'ASC' ? 'ASC' : 'DESC';
      const sortColumn =
        options.sortBy === 'actor'
          ? 'admin.username'
          : options.sortBy === 'action'
            ? 'audit_log.action'
            : options.sortBy === 'target'
              ? 'audit_log.entity_type'
              : 'audit_log.createdAt';
      query.orderBy(sortColumn, sortOrder);
      if (options.sortBy === 'target') {
        query.addOrderBy('audit_log.entity_id', sortOrder);
      }
      if (options.sortBy && options.sortBy !== 'createdAt') {
        query.addOrderBy('audit_log.createdAt', 'DESC');
      }
      query.limit(options.limit || 100);
      query.offset(options.offset || 0);

      const [logs, total] = await query.getManyAndCount();

      return {
        logs,
        total,
        limit: options.limit || 100,
        offset: options.offset || 0,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to get audit logs: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        logs: [],
        total: 0,
        limit: options.limit || 100,
        offset: options.offset || 0,
      };
    }
  }

  /**
   * Get audit log statistics
   */
  async getStatistics(startDate?: Date, endDate?: Date) {
    try {
      // Create a base query for counting total logs
      const countQuery =
        this.auditLogRepository.createQueryBuilder('audit_log');

      if (startDate) {
        countQuery.andWhere('audit_log.createdAt >= :startDate', { startDate });
      }

      if (endDate) {
        countQuery.andWhere('audit_log.createdAt <= :endDate', { endDate });
      }

      // Get total count before modifying the query for group by
      const totalLogs = await countQuery.getCount();

      // Create a separate query for action type counts (with group by)
      const statsQuery =
        this.auditLogRepository.createQueryBuilder('audit_log');

      if (startDate) {
        statsQuery.andWhere('audit_log.createdAt >= :startDate', { startDate });
      }

      if (endDate) {
        statsQuery.andWhere('audit_log.createdAt <= :endDate', { endDate });
      }

      const actionTypeCounts = await statsQuery
        .select('audit_log.action', 'actionType')
        .addSelect('COUNT(*)', 'count')
        .groupBy('audit_log.action')
        .getRawMany();

      return {
        totalLogs,
        actionTypeCounts,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to get audit log statistics: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        totalLogs: 0,
        actionTypeCounts: [],
      };
    }
  }

  async getObservabilityMetrics(startDate?: Date, endDate?: Date) {
    const [statistics, recentFailures] = await Promise.all([
      this.getStatistics(startDate, endDate),
      this.findAll({
        startDate,
        endDate,
        search: 'failed',
        limit: 10,
        offset: 0,
      }),
    ]);

    return {
      audit: {
        totalLogs: statistics.totalLogs,
        actionTypeCounts: statistics.actionTypeCounts,
      },
      failures: {
        total: recentFailures.total,
        recent: recentFailures.logs,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getTemplateRolloutHistory(options: {
    templateKey?: string;
    templateVersion?: string;
    actorId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    try {
      const rolloutActionTypes: AuditActionType[] = [
        AuditActionType.TEMPLATE_STATE_TRANSITION,
        AuditActionType.TEMPLATE_ROLLOUT_KILLSWITCH,
        AuditActionType.TEMPLATE_FALLBACK_ACTIVATED,
        AuditActionType.TEMPLATE_ROLLOUT_DIFF_RECORDED,
      ];

      const query = this.auditLogRepository
        .createQueryBuilder('audit_log')
        .leftJoinAndSelect('audit_log.admin', 'admin')
        .where('audit_log.action IN (:...actionTypes)', {
          actionTypes: rolloutActionTypes,
        });

      if (options.templateKey) {
        query.andWhere("audit_log.metadata->>'templateKey' = :templateKey", {
          templateKey: options.templateKey,
        });
      }

      if (options.templateVersion) {
        query.andWhere(
          "audit_log.metadata->>'templateVersion' = :templateVersion",
          {
            templateVersion: options.templateVersion,
          },
        );
      }

      if (options.actorId) {
        const normalizedActorId = this.toNullableUserId(options.actorId);
        query.andWhere(
          normalizedActorId === null
            ? "audit_log.metadata->>'actorId' = :actorIdRaw"
            : "(audit_log.admin_id = :actorId OR audit_log.metadata->>'actorId' = :actorIdRaw)",
          { actorId: normalizedActorId, actorIdRaw: options.actorId },
        );
      }

      if (options.startDate) {
        query.andWhere('audit_log.createdAt >= :startDate', {
          startDate: options.startDate,
        });
      }

      if (options.endDate) {
        query.andWhere('audit_log.createdAt <= :endDate', {
          endDate: options.endDate,
        });
      }

      query.orderBy('audit_log.createdAt', 'DESC');
      query.limit(options.limit || 100);
      query.offset(options.offset || 0);

      const [logs, total] = await query.getManyAndCount();

      return {
        logs,
        total,
        limit: options.limit || 100,
        offset: options.offset || 0,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to get template rollout history: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        logs: [],
        total: 0,
        limit: options.limit || 100,
        offset: options.offset || 0,
      };
    }
  }

  async getExportAccessTrail(options: {
    requestId?: string;
    exportId?: string;
    actorId?: string;
    actorType?: ExportActorType;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    try {
      const exportActionTypes: AuditActionType[] = [
        AuditActionType.EXPORT_REQUEST_CREATED,
        AuditActionType.EXPORT_GENERATION_COMPLETED,
        AuditActionType.EXPORT_LINK_REFRESHED,
        AuditActionType.EXPORT_DOWNLOADED,
      ];

      const query = this.auditLogRepository
        .createQueryBuilder('audit_log')
        .leftJoinAndSelect('audit_log.admin', 'admin')
        .where('audit_log.action IN (:...actionTypes)', {
          actionTypes: exportActionTypes,
        })
        .andWhere('audit_log.entity_type = :entityType', {
          entityType: 'data_export',
        });

      if (options.requestId) {
        query.andWhere(
          "(audit_log.request_id = :requestId OR audit_log.metadata->>'requestId' = :requestId)",
          { requestId: options.requestId },
        );
      }

      if (options.exportId) {
        query.andWhere(
          "(audit_log.metadata->>'exportId' = :exportId OR audit_log.metadata->>'entityId' = :exportId)",
          {
            exportId: options.exportId,
          },
        );
      }

      if (options.actorId) {
        const normalizedActorId = this.toNullableUserId(options.actorId);
        query.andWhere(
          normalizedActorId === null
            ? "audit_log.metadata->>'actorId' = :actorIdRaw"
            : "(audit_log.admin_id = :actorId OR audit_log.metadata->>'actorId' = :actorIdRaw)",
          { actorId: normalizedActorId, actorIdRaw: options.actorId },
        );
      }

      if (options.actorType) {
        query.andWhere("audit_log.metadata->>'actorType' = :actorType", {
          actorType: options.actorType,
        });
      }

      if (options.startDate) {
        query.andWhere('audit_log.createdAt >= :startDate', {
          startDate: options.startDate,
        });
      }

      if (options.endDate) {
        query.andWhere('audit_log.createdAt <= :endDate', {
          endDate: options.endDate,
        });
      }

      query.orderBy('audit_log.createdAt', 'DESC');
      query.limit(options.limit || 100);
      query.offset(options.offset || 0);

      const [logs, total] = await query.getManyAndCount();

      return {
        logs,
        total,
        limit: options.limit || 100,
        offset: options.offset || 0,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to get export access trail: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        logs: [],
        total: 0,
        limit: options.limit || 100,
        offset: options.offset || 0,
      };
    }
  }

  private createActor(
    type: AuditActorType,
    id: string | number,
    overrides?: {
      userId?: string | number | null;
      label?: string;
      source?: string | null;
    },
  ): AuditActor {
    const actorId = String(id);
    const actorUserId =
      overrides?.userId !== undefined
        ? overrides.userId === null ||
          overrides.userId === undefined ||
          overrides.userId === ''
          ? null
          : String(overrides.userId)
        : type === 'user' || type === 'admin'
          ? actorId
          : null;

    return {
      type,
      id: actorId,
      userId: actorUserId,
      label: overrides?.label,
      source: overrides?.source,
    };
  }

  private resolveActor(dto: CreateAuditLogDto): AuditActor | null {
    if (dto.context?.actor?.id) {
      return dto.context.actor;
    }

    const metadataActorType = dto.metadata?.actorType as
      | AuditActorType
      | undefined;
    const metadataActorId = dto.metadata?.actorId
      ? String(dto.metadata.actorId)
      : undefined;

    if (metadataActorType && metadataActorId) {
      return this.createActor(metadataActorType, metadataActorId, {
        userId:
          metadataActorType === 'user' || metadataActorType === 'admin'
            ? metadataActorId
            : null,
        label: dto.metadata?.actorLabel as string | undefined,
        source: dto.metadata?.actorSource as string | null | undefined,
      });
    }

    if (dto.context?.userId) {
      return this.createActor('user', String(dto.context.userId), {
        userId: dto.context.userId,
      });
    }

    return null;
  }
}
