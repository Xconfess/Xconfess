import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditActionType } from './audit-log.entity';

export interface AuditLogContext {
  userId?: string | null;
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
  metadata?: Record<string, any>;
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
  before: Record<string, any>;
  after: Record<string, any>;
  source?: TemplateRolloutSourceMetadata;
}

export type ExportLifecycleAction =
  | 'request_created'
  | 'generation_completed'
  | 'link_refreshed'
  | 'downloaded';

export type ExportActorType = AuditActorType;

export interface ExportLifecycleAuditRecord {
  action: ExportLifecycleAction;
  requestId: string;
  exportId?: string;
  actorType: ExportActorType;
  actorId?: string | null;
  occurredAt?: string;
  metadata?: Record<string, any>;
  context?: AuditLogContext;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Log a sensitive action to the audit log
   * Includes error handling to prevent logging failures from breaking the application
   */
  async log(dto: CreateAuditLogDto): Promise<void> {
    try {
      const actor = this.resolveActor(dto);
      const auditLog = this.auditLogRepository.create({
        userId: dto.context?.userId || null,
        actionType: dto.actionType,
        metadata: {
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
          ...(dto.metadata?.templateKey && dto.metadata?.templateVersion
            ? {
                templateKey: dto.metadata.templateKey,
                templateVersion: dto.metadata.templateVersion,
              }
            : {}),
        },
        ipAddress: dto.context?.ipAddress || null,
        userAgent: dto.context?.userAgent || null,
      });

      await this.auditLogRepository.save(auditLog);

      this.logger.log(
        `Audit log created: ${dto.actionType} by ${actor?.type || 'anonymous'} ${actor?.id || dto.context?.userId || 'anonymous'}`,
      );
    } catch (error) {
      // Log the error but don't throw to prevent disrupting the main operation
      this.logger.error(
        `Failed to create audit log for action ${dto.actionType}: ${error.message}`,
        error.stack,
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
      jobId?: string;
      filters?: Record<string, any>;
      summary?: {
        attempted: number;
        replayed: number;
        failed: number;
      };
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
      default:
        return AuditActionType.EXPORT_REQUEST_CREATED;
    }
  }

  async logExportLifecycleEvent(
    record: ExportLifecycleAuditRecord,
  ): Promise<void> {
    const occurredAt = record.occurredAt || new Date().toISOString();
    const exportId = record.exportId || record.requestId;

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
        userId:
          record.actorType === 'user' || record.actorType === 'admin'
            ? record.actorId || record.context?.userId || null
            : null,
        actor: this.createActor(
          record.actorType,
          record.actorId || record.action,
          {
            userId:
              record.actorType === 'user' || record.actorType === 'admin'
                ? record.actorId || record.context?.userId || null
                : null,
          },
        ),
      },
    });
  }

  private buildRolloutDiff(
    before: Record<string, any>,
    after: Record<string, any>,
  ): Record<string, { before: any; after: any }> {
    const keys = new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]);
    const diff: Record<string, { before: any; after: any }> = {};

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

  private toNullableUuid(value?: string | null): string | null {
    if (!value || !this.uuidPattern.test(value)) {
      return null;
    }
    return value;
  }

  async logTemplateRolloutDiff(
    record: TemplateRolloutDiffRecord,
    context?: AuditLogContext,
  ): Promise<void> {
    const correlationId = record.source?.correlationId || context?.requestId;
    const diff = this.buildRolloutDiff(record.before, record.after);

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
        userId: context?.userId || this.toNullableUuid(record.actorId),
        actor: this.createActor(record.actorType || 'admin', record.actorId, {
          userId: context?.userId || this.toNullableUuid(record.actorId),
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
        actorId: context?.actor?.id || context?.userId || 'template-fallback',
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
        .leftJoinAndSelect('audit_log.user', 'user')
        .where("audit_log.metadata->>'entityType' = :entityType", {
          entityType,
        })
        .andWhere("audit_log.metadata->>'entityId' = :entityId", { entityId })
        .orderBy('audit_log.timestamp', 'DESC')
        .getMany();

      return logs;
    } catch (error) {
      this.logger.error(
        `Failed to find audit logs by entity: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Find audit logs by user
   */
  async findByUser(userId: string): Promise<AuditLog[]> {
    try {
      return this.auditLogRepository.find({
        where: { userId },
        order: { timestamp: 'DESC' },
        relations: ['user'],
      });
    } catch (error) {
      this.logger.error(`Failed to find audit logs by user: ${error.message}`);
      return [];
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async findAll(options: {
    userId?: string;
    actorId?: string;
    actorType?: string;
    actionType?: AuditActionType;
    entityType?: string;
    entityId?: string;
    requestId?: string;
    exportId?: string;
    templateKey?: string;
    templateVersion?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    try {
      const query = this.auditLogRepository
        .createQueryBuilder('audit_log')
        .leftJoinAndSelect('audit_log.user', 'user');

      if (options.userId) {
        query.andWhere('audit_log.user_id = :userId', {
          userId: options.userId,
        });
      }

      if (options.actorId) {
        query.andWhere(
          "(audit_log.user_id = :actorId OR audit_log.metadata->>'actorId' = :actorId)",
          {
            actorId: options.actorId,
          },
        );
      }

      if (options.actorType) {
        query.andWhere("audit_log.metadata->>'actorType' = :actorType", {
          actorType: options.actorType,
        });
      }

      if (options.actionType) {
        query.andWhere('audit_log.action_type = :actionType', {
          actionType: options.actionType,
        });
      }

      if (options.entityType) {
        query.andWhere("audit_log.metadata->>'entityType' = :entityType", {
          entityType: options.entityType,
        });
      }

      if (options.entityId) {
        query.andWhere("audit_log.metadata->>'entityId' = :entityId", {
          entityId: options.entityId,
        });
      }

      if (options.requestId) {
        query.andWhere("audit_log.metadata->>'requestId' = :requestId", {
          requestId: options.requestId,
        });
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

      if (options.startDate) {
        query.andWhere('audit_log.timestamp >= :startDate', {
          startDate: options.startDate,
        });
      }

      if (options.endDate) {
        query.andWhere('audit_log.timestamp <= :endDate', {
          endDate: options.endDate,
        });
      }

      query.orderBy('audit_log.timestamp', 'DESC');
      query.limit(options.limit || 100);
      query.offset(options.offset || 0);

      const [logs, total] = await query.getManyAndCount();

      return {
        logs,
        total,
        limit: options.limit || 100,
        offset: options.offset || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get audit logs: ${error.message}`);
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
        countQuery.andWhere('audit_log.timestamp >= :startDate', { startDate });
      }

      if (endDate) {
        countQuery.andWhere('audit_log.timestamp <= :endDate', { endDate });
      }

      // Get total count before modifying the query for group by
      const totalLogs = await countQuery.getCount();

      // Create a separate query for action type counts (with group by)
      const statsQuery =
        this.auditLogRepository.createQueryBuilder('audit_log');

      if (startDate) {
        statsQuery.andWhere('audit_log.timestamp >= :startDate', { startDate });
      }

      if (endDate) {
        statsQuery.andWhere('audit_log.timestamp <= :endDate', { endDate });
      }

      const actionTypeCounts = await statsQuery
        .select('audit_log.action_type', 'actionType')
        .addSelect('COUNT(*)', 'count')
        .groupBy('audit_log.action_type')
        .getRawMany();

      return {
        totalLogs,
        actionTypeCounts,
      };
    } catch (error) {
      this.logger.error(`Failed to get audit log statistics: ${error.message}`);
      return {
        totalLogs: 0,
        actionTypeCounts: [],
      };
    }
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
        .leftJoinAndSelect('audit_log.user', 'user')
        .where('audit_log.action_type IN (:...actionTypes)', {
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
        query.andWhere(
          "(audit_log.user_id = :actorId OR audit_log.metadata->>'actorId' = :actorId)",
          { actorId: options.actorId },
        );
      }

      if (options.startDate) {
        query.andWhere('audit_log.timestamp >= :startDate', {
          startDate: options.startDate,
        });
      }

      if (options.endDate) {
        query.andWhere('audit_log.timestamp <= :endDate', {
          endDate: options.endDate,
        });
      }

      query.orderBy('audit_log.timestamp', 'DESC');
      query.limit(options.limit || 100);
      query.offset(options.offset || 0);

      const [logs, total] = await query.getManyAndCount();

      return {
        logs,
        total,
        limit: options.limit || 100,
        offset: options.offset || 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get template rollout history: ${error.message}`,
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
        .leftJoinAndSelect('audit_log.user', 'user')
        .where('audit_log.action_type IN (:...actionTypes)', {
          actionTypes: exportActionTypes,
        })
        .andWhere("audit_log.metadata->>'entityType' = :entityType", {
          entityType: 'data_export',
        });

      if (options.requestId) {
        query.andWhere("audit_log.metadata->>'requestId' = :requestId", {
          requestId: options.requestId,
        });
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
        query.andWhere(
          "(audit_log.user_id = :actorId OR audit_log.metadata->>'actorId' = :actorId)",
          { actorId: options.actorId },
        );
      }

      if (options.actorType) {
        query.andWhere("audit_log.metadata->>'actorType' = :actorType", {
          actorType: options.actorType,
        });
      }

      if (options.startDate) {
        query.andWhere('audit_log.timestamp >= :startDate', {
          startDate: options.startDate,
        });
      }

      if (options.endDate) {
        query.andWhere('audit_log.timestamp <= :endDate', {
          endDate: options.endDate,
        });
      }

      query.orderBy('audit_log.timestamp', 'DESC');
      query.limit(options.limit || 100);
      query.offset(options.offset || 0);

      const [logs, total] = await query.getManyAndCount();

      return {
        logs,
        total,
        limit: options.limit || 100,
        offset: options.offset || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get export access trail: ${error.message}`);
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
    id: string,
    overrides?: Partial<AuditActor>,
  ): AuditActor {
    return {
      type,
      id,
      userId:
        overrides?.userId !== undefined
          ? overrides.userId
          : type === 'user' || type === 'admin'
            ? id
            : null,
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
        label: dto.metadata?.actorLabel,
        source: dto.metadata?.actorSource,
      });
    }

    if (dto.context?.userId) {
      return this.createActor('user', dto.context.userId, {
        userId: dto.context.userId,
      });
    }

    return null;
  }
}
