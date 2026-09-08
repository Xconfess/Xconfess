import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Report } from '../admin/entities/report.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      AnonymousConfession,
      AnonymousUser,
      OutboxEvent,
    ]),
    AuditLogModule,
    AuthModule,
    UserModule,
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportModule {}
