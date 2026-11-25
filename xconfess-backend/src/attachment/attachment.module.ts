import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { AttachmentRepository } from './repository/attachment.repository';
import { AttachmentCleanupService } from './attachment-cleanup.service';
import { AttachmentIntegrityService } from './attachment-integrity.service';
import { AttachmentValidationService } from './attachment-validation.service';
import { AttachmentController } from './attachment.controller';
import { AttachmentDeletionWorker } from './attachment-deletion.worker';
import { ATTACHMENT_STORAGE, NoopAttachmentStorage } from './attachment-storage';
import { UserModule } from '../user/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment]), UserModule],
  controllers: [AttachmentController],
  providers: [
    AttachmentRepository,
    AttachmentCleanupService,
    AttachmentIntegrityService,
    AttachmentValidationService,
    AttachmentDeletionWorker,
    { provide: ATTACHMENT_STORAGE, useClass: NoopAttachmentStorage },
  ],
  exports: [
    AttachmentRepository,
    AttachmentCleanupService,
    AttachmentDeletionWorker,
  ],
})
export class AttachmentModule {}
