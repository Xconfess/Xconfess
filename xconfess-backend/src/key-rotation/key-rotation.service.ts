import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { EncryptionService } from '../encryption/encryption.service';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';

export interface RotationResult {
  total: number;
  rotated: number;
  alreadyCurrent: number;
  failed: number;
  skipped: number;
  errors: Array<{ confessionId: string; error: string }>;
  quarantined: string[];
  lastProcessedId: string | null;
  dryRun: boolean;
  resumeAfter?: string;
}

export interface RotationOptions {
  batchSize?: number;
  dryRun?: boolean;
  resumeAfterId?: string;
}

@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);

  constructor(
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepo: Repository<AnonymousConfession>,
    private readonly encryptionService: EncryptionService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Rotate all confessions that are NOT on the current key version.
   * Processes in batches to avoid memory pressure and allow progress reporting.
   *
   * Only wrappedDek + keyVersion columns are updated — encryptedContent is never touched.
   *
   * @param options.dryRun - When true, performs all checks but does not persist changes.
   * @param options.resumeAfterId - When set, resumes processing after this confession ID.
   */
  async rotateMasterKey(options: RotationOptions = {}): Promise<RotationResult> {
    const batchSize = options.batchSize || 500;
    const dryRun = options.dryRun || false;
    const resumeAfterId = options.resumeAfterId || null;

    const result: RotationResult = {
      total: 0,
      rotated: 0,
      alreadyCurrent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      quarantined: [],
      lastProcessedId: null,
      dryRun,
      resumeAfter: resumeAfterId || undefined,
    };

    this.logger.log(
      `Starting key rotation${dryRun ? ' (DRY RUN)' : ''}${resumeAfterId ? ` after ID ${resumeAfterId}` : ''}` +
        ` batchSize=${batchSize}`,
    );

    await this.auditLogService.log({
      actionType: AuditActionType.STELLAR_CONTRACT_INVOCATION,
      metadata: {
        eventType: 'KEY_ROTATION_STARTED',
        dryRun,
        resumeAfterId: resumeAfterId || null,
        batchSize,
        startedAt: new Date().toISOString(),
      },
      context: {
        actor: { type: 'system', id: 'key-rotation-service', userId: null, label: 'Key Rotation Job' },
      },
    });

    let offset = 0;
    let batchNumber = 0;

    while (true) {
      batchNumber++;
      const query = this.confessionRepo
        .createQueryBuilder('confession')
        .where("confession.wrappedDek IS NOT NULL AND confession.wrappedDek != ''")
        .andWhere("confession.migrationStatus = :migrationStatus", { migrationStatus: 'completed' });

      if (resumeAfterId && batchNumber === 1) {
        query.andWhere('confession.id > :resumeAfterId', { resumeAfterId });
      }

      const batch = await query
        .select(['confession.id', 'confession.encryptedContent', 'confession.wrappedDek', 'confession.keyVersion'])
        .take(batchSize)
        .skip(offset)
        .orderBy('confession.id', 'ASC')
        .getMany();

      if (batch.length === 0) break;
      result.total += batch.length;

      this.logger.log(
        `Processing batch #${batchNumber} offset=${offset} size=${batch.length}`,
      );

      for (const confession of batch) {
        try {
          if (this.encryptionService.isCurrentVersion(confession.keyVersion || '')) {
            result.alreadyCurrent++;
            continue;
          }

          const rewrapped = this.encryptionService.rewrapDek({
            encryptedContent: confession.encryptedContent || '',
            wrappedDek: confession.wrappedDek || '',
            keyVersion: confession.keyVersion || '',
          });

          if (!dryRun) {
            await this.confessionRepo.update(confession.id, {
              wrappedDek: rewrapped.wrappedDek,
              keyVersion: rewrapped.keyVersion,
            });
          }

          result.rotated++;
        } catch (err: any) {
          result.failed++;
          result.errors.push({
            confessionId: confession.id,
            error: err?.message ?? String(err),
          });
          result.quarantined.push(confession.id);

          this.logger.error(
            `Failed to rotate confession ${confession.id}: ${err?.message}`,
          );

          await this.auditLogService.log({
            actionType: AuditActionType.STELLAR_CONTRACT_INVOCATION,
            metadata: {
              eventType: 'KEY_ROTATION_FAILURE',
              confessionId: confession.id,
              error: err?.message ?? String(err),
              dryRun,
              occurredAt: new Date().toISOString(),
            },
            context: {
              actor: { type: 'system', id: 'key-rotation-service', userId: null, label: 'Key Rotation Job' },
            },
          });
        }
      }

      offset += batchSize;
      result.lastProcessedId = batch[batch.length - 1]?.id || result.lastProcessedId;

      if (!dryRun) {
        // Small yield between batches to avoid starving other DB operations
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    const summary = {
      total: result.total,
      rotated: result.rotated,
      alreadyCurrent: result.alreadyCurrent,
      failed: result.failed,
      skipped: result.skipped,
      quarantinedCount: result.quarantined.length,
      dryRun,
      resumeAfter: resumeAfterId || null,
    };

    this.logger.log(
      `Rotation complete: total=${result.total} rotated=${result.rotated} ` +
        `alreadyCurrent=${result.alreadyCurrent} failed=${result.failed} skipped=${result.skipped}` +
        `${dryRun ? ' (DRY RUN - no changes persisted)' : ''}`,
    );

    await this.auditLogService.log({
      actionType: AuditActionType.STELLAR_CONTRACT_INVOCATION,
      metadata: {
        eventType: 'KEY_ROTATION_COMPLETED',
        summary,
        completedAt: new Date().toISOString(),
        lastProcessedId: result.lastProcessedId,
      },
      context: {
        actor: { type: 'system', id: 'key-rotation-service', userId: null, label: 'Key Rotation Job' },
      },
    });

    return result;
  }

  /**
   * Get the count of confessions awaiting rotation.
   */
  async getRotationPendingCount(): Promise<number> {
    return this.confessionRepo.count({
      where: {
        wrappedDek: Not(IsNull()),
        migrationStatus: 'completed',
      },
    });
  }
}
