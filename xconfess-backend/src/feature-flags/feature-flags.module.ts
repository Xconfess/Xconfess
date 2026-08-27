import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsController } from './feature-flags.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureFlag]), AuditLogModule],
  providers: [FeatureFlagsService],
  controllers: [FeatureFlagsController],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
