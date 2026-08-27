import { Module, Global } from '@nestjs/common';
import { QueryAnalyzer } from './query-analyzer';
import { MigrationVerificationService } from './migration-verification.service';

@Global()
@Module({
  providers: [QueryAnalyzer, MigrationVerificationService],
  exports: [QueryAnalyzer, MigrationVerificationService],
})
export class DatabaseModule {}
