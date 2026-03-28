import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { ExportProcessor } from './export.processor';
import { User } from '../user/entities/user.entity';
import { EmailModule } from '../email/email.module';
import { EXPORT_QUEUE_NAME } from './data-export.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: EXPORT_QUEUE_NAME,
    }),
    TypeOrmModule.forFeature([ExportRequest, ExportChunk, User]),
    EmailModule,
  ],
  controllers: [DataExportController],
  providers: [DataExportService, ExportProcessor],
  exports: [DataExportService],
})
export class DataExportModule {}
