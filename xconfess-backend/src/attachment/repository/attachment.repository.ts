import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, IsNull, Not, MoreThan } from 'typeorm';
import { Attachment, AttachmentStatus } from '../entities/attachment.entity';

@Injectable()
export class AttachmentRepository {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
  ) {}

  /**
   * Find attachments that are not referenced by any confession or message
   * and are older than the grace period.
   */
  async findUnreferencedAttachments(gracePeriodMs: number): Promise<Attachment[]> {
    const cutoff = new Date(Date.now() - gracePeriodMs);
    return this.attachmentRepository
      .createQueryBuilder('attachment')
      .where('attachment.confessionId IS NULL')
      .andWhere('attachment.messageId IS NULL')
      .andWhere('attachment.createdAt < :cutoff', { cutoff })
      .andWhere('attachment.status IN (:...statuses)', {
        statuses: [AttachmentStatus.UPLOADING, AttachmentStatus.FAILED, AttachmentStatus.ABANDONED],
      })
      .getMany();
  }

  /**
   * Find attachments with UPLOADING status that have expired (stuck uploads)
   */
  async findStuckUploads(gracePeriodMs: number): Promise<Attachment[]> {
    const cutoff = new Date(Date.now() - gracePeriodMs);
    return this.attachmentRepository.find({
      where: {
        status: AttachmentStatus.UPLOADING,
        createdAt: LessThan(cutoff),
      },
    });
  }

  /**
   * Find all attachments that are candidates for cleanup
   */
  async findCleanupCandidates(gracePeriodMs: number): Promise<Attachment[]> {
    const cutoff = new Date(Date.now() - gracePeriodMs);
    
    // Find unreferenced attachments
    const unreferenced = await this.findUnreferencedAttachments(gracePeriodMs);
    
    // Find stuck uploads
    const stuck = await this.findStuckUploads(gracePeriodMs);
    
    // Combine and deduplicate by ID
    const all = [...unreferenced, ...stuck];
    const seen = new Set<string>();
    return all.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }

  /**
   * Mark attachments as abandoned (idempotent)
   */
  async markAsAbandoned(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.attachmentRepository
      .createQueryBuilder()
      .update(Attachment)
      .set({ 
        status: AttachmentStatus.ABANDONED,
        updatedAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('id IN (:...ids)', { ids })
      .andWhere('status != :abandoned', { abandoned: AttachmentStatus.ABANDONED })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Delete abandoned attachments (idempotent - only deletes ABANDONED status)
   */
  async deleteAbandonedAttachments(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.attachmentRepository
      .createQueryBuilder()
      .delete()
      .from(Attachment)
      .where('id IN (:...ids)', { ids })
      .andWhere('status = :abandoned', { abandoned: AttachmentStatus.ABANDONED })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Check if an attachment is referenced (has confessionId or messageId)
   */
  async isReferenced(id: string): Promise<boolean> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
      select: ['confessionId', 'messageId'],
    });
    return !!(attachment?.confessionId || attachment?.messageId);
  }

  /**
   * Get attachment by ID
   */
  async findById(id: string): Promise<Attachment | null> {
    return this.attachmentRepository.findOne({ where: { id } });
  }

  /**
   * Create a new attachment record
   */
  async create(attachment: Partial<Attachment>): Promise<Attachment> {
    return this.attachmentRepository.save(this.attachmentRepository.create(attachment));
  }

  /**
   * Update attachment status
   */
  async updateStatus(
    id: string,
    status: AttachmentStatus,
    additionalData?: Partial<Attachment>,
  ): Promise<void> {
    await this.attachmentRepository.update(id, {
      status,
      ...additionalData,
      updatedAt: new Date(),
    });
  }

  /**
   * Find attachments by criteria
   */
  async find(options: { where: { status: AttachmentStatus } }): Promise<Attachment[]> {
    return this.attachmentRepository.find(options);
  }
}