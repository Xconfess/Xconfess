import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './services/admin.service';
import { ModerationService } from './services/moderation.service';
import { Report } from './entities/report.entity';
import { AuditLog } from './entities/audit-log.entity';
import { ModerationNoteTemplate } from '../comment/entities/moderation-note-template.entity';
import { ModerationTemplateService } from '../comment/moderation-template.service';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { User } from '../user/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { AdminGateway } from './realtime/admin.gateway';
import { ReportsEventsListener } from './realtime/reports.events.listener';
import { UserModule } from '../user/user.module';
import { UserAnonymousUser } from '../user/entities/user-anonymous-link.entity';
import { WebSocketLogger } from '../websocket/websocket.logger';
import { WsRolesGuard } from '../auth/guards/ws-roles.guard';
import { Reflector } from '@nestjs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      AuditLog,
      ModerationNoteTemplate,
      AnonymousConfession,
      User,
      UserAnonymousUser,
    ]),
    AuthModule,
    UserModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    ModerationService,
    ModerationTemplateService,
    AdminGateway,
    ReportsEventsListener,
    WebSocketLogger,
    WsRolesGuard,
    Reflector,
  ],
  exports: [AdminService, ModerationService, ModerationTemplateService],
})
export class AdminModule {}
