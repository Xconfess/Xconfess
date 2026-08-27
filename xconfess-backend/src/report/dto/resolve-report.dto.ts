import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload for POST /admin/reports/:id/action.
 *
 * Used by `ReportsService.actionReport()`.  The `action` field drives
 * which status transition is applied; `note` is stored as resolutionNotes.
 */
export class ResolveReportDto {
  /**
   * The moderation decision.
   *
   * Using @IsIn rather than @IsEnum because the two valid values ('resolved',
   * 'dismissed') are not a TypeScript enum — they are a union type used
   * directly in the service.  @IsIn validates against an explicit allowlist
   * and produces a clear error message listing the accepted values.
   */
  @IsIn(['resolved', 'dismissed'], {
    message: "action must be either 'resolved' or 'dismissed'",
  })
  action: 'resolved' | 'dismissed';

  /**
   * Optional moderator note stored alongside the resolution.
   * Falls back to 'Report resolved' or 'Report dismissed' in the service
   * when absent.
   */
  @IsOptional()
  @IsString({ message: 'note must be a string' })
  @MaxLength(1000, { message: 'note must be at most 1000 characters' })
  note?: string;
}
