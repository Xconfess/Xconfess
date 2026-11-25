import { Injectable, Logger } from '@nestjs/common';

/** Injection token for the object-storage backend used by attachment cleanup. */
export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');

/** Thrown by a storage backend when the object is already gone. */
export class ObjectNotFoundError extends Error {
  constructor(message = 'Object not found') {
    super(message);
    this.name = 'ObjectNotFoundError';
  }
}

/**
 * Minimal storage port. A real backend (S3, Minio, ...) implements this and is
 * bound to ATTACHMENT_STORAGE. Backends may either throw ObjectNotFoundError
 * or resolve silently when the object does not exist; both count as success.
 */
export interface AttachmentStorage {
  deleteObject(objectKey: string): Promise<void>;
}

/**
 * Default binding while no object store is integrated (see
 * AttachmentIntegrityService): there is nothing to delete, so deletion
 * trivially succeeds. Never logs the object key.
 */
@Injectable()
export class NoopAttachmentStorage implements AttachmentStorage {
  private readonly logger = new Logger(NoopAttachmentStorage.name);

  async deleteObject(): Promise<void> {
    this.logger.debug('No object storage configured; nothing to delete');
  }
}
