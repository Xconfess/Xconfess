import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogRedactionService } from './audit-log-redaction.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditLogService, AuditLogRedactionService],
  exports: [AuditLogService, AuditLogRedactionService],
})
export class AuditLogModule {}
