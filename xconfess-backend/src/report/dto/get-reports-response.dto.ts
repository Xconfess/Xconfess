import { ReportStatus, ReportType } from '../../admin/entities/report.entity';

export class GetReportsResponseDto {
  id: string;
  confessionId: string;
  reporterId: number | null;
  type: ReportType;
  reason: string | null;
  status: ReportStatus;
  resolvedBy: number | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PaginatedReportsResponseDto {
  data: GetReportsResponseDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
