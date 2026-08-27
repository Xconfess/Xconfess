import { registerAs } from '@nestjs/config';

export interface ExportRetentionConfig {
  retentionDays: number;
  auditCleanupActions: boolean;
  dryRun: boolean;
}

export default registerAs(
  'export',
  (): ExportRetentionConfig => ({
    retentionDays: Number(process.env.EXPORT_RETENTION_DAYS ?? 7),
    auditCleanupActions: (process.env.EXPORT_AUDIT_CLEANUP_ACTIONS ?? 'true') === 'true',
    dryRun: (process.env.EXPORT_CLEANUP_DRY_RUN ?? 'false') === 'true',
  }),
);
