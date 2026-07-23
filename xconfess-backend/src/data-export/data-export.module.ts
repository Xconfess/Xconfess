import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { DataCleanupService } from './data-export-cleanup';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { ExportProcessor } from './export.processor';
import { User } from '../user/entities/user.entity';
import { EmailModule } from '../email/email.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { EXPORT_QUEUE_NAME } from './data-export.constants';
const jobsEnabled = process.env.ENABLE_BACKGROUND_JOBS === 'true';
@Module({
  imports: [
    BullModule.registerQueue({
      name: EXPORT_QUEUE_NAME,
    }),
    TypeOrmModule.forFeature([ExportRequest, ExportChunk, User]),
    EmailModule,
    AuditLogModule,
  ],
  controllers: [DataExportController],
  providers: [
    DataExportService,
    DataCleanupService,
    ...(jobsEnabled ? [ExportProcessor] : []),
  ],
  exports: [DataExportService, DataCleanupService],
})
export class DataExportModule {}
