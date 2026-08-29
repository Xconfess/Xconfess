import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { EncryptionModule } from '../encryption/encryption.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { KeyRotationService } from './key-rotation.service';
import { KeyRotationController } from './key-rotation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnonymousConfession]),
    EncryptionModule,
    AuditLogModule,
    AuthModule,
  ],
  controllers: [KeyRotationController],
  providers: [KeyRotationService],
  exports: [KeyRotationService],
})
export class KeyRotationModule {}
