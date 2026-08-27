import {
  IsEnum,
  IsOptional,
  IsDateString,
  IsNumberString,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ReportStatus, ReportType } from '../../admin/entities/report.entity';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class GetReportsQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ReportType)
  reason?: ReportType;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumberString()
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @IsOptional()
  @IsNumberString()
  @Transform(({ value }) => parseInt(value))
  limit?: number = 10;

  @IsOptional()
  @IsIn(['id', 'createdAt', 'status', 'reason'])
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: SortOrder = SortOrder.DESC;
}
