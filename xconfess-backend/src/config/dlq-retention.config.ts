import { ConfigService } from '@nestjs/config';

export interface DlqRetentionConfig {
  retentionDays: number; // How many days to keep DLQ jobs
  cleanupBatchSize: number; // Max jobs to process per cleanup run
  dryRun: boolean; // If true, only logs candidates
}

export const getDlqRetentionConfig = (
  configService: ConfigService,
): DlqRetentionConfig => ({
  retentionDays: configService.get<number>('DLQ_RETENTION_DAYS', 14),
  cleanupBatchSize: configService.get<number>('DLQ_CLEANUP_BATCH_SIZE', 100),
  dryRun: configService.get<boolean>('DLQ_CLEANUP_DRY_RUN', false),
});
