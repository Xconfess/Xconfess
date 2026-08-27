import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ReportType } from '../../admin/entities/report.entity';

export class CreateReportDto {
  @IsEnum(ReportType)
  @IsNotEmpty()
  type: ReportType;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
