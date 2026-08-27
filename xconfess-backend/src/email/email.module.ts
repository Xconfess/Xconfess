import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { User } from '../user/entities/user.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { mailConfig, circuitBreakerConfig } from '../config/email.config';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { MailConfigValidator } from './mail-config-validator';

@Module({
  imports: [
    ConfigModule.forFeature(mailConfig),
    ConfigModule.forFeature(circuitBreakerConfig),
    TypeOrmModule.forFeature([User, AnonymousConfession]),
    AuditLogModule,
  ],
  controllers: [EmailController],
  providers: [EmailService, MailConfigValidator],
  exports: [EmailService, MailConfigValidator],
})
export class EmailModule {}
