import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { AttachmentRepository } from './repository/attachment.repository';
import { AttachmentCleanupService } from './attachment-cleanup.service';
import { AttachmentIntegrityService } from './attachment-integrity.service';
import { AttachmentController } from './attachment.controller';
import { UserModule } from '../user/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment]), UserModule],
  controllers: [AttachmentController],
  providers: [AttachmentRepository, AttachmentCleanupService, AttachmentIntegrityService],
  exports: [AttachmentRepository, AttachmentCleanupService],
})
export class AttachmentModule {}
