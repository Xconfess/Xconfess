import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportStatus } from '../../admin/entities/report.entity';

export class UpdateReportStatusDto {
  @IsEnum([ReportStatus.RESOLVED, ReportStatus.DISMISSED], {
    message: 'status must be "resolved" or "dismissed"',
  })
  status: ReportStatus.RESOLVED | ReportStatus.DISMISSED;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionReason?: string;
}
