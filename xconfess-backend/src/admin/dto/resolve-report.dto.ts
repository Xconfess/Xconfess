import { IsOptional, IsString, IsInt, MaxLength, Min } from 'class-validator';

export class ResolveReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNotes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  templateId?: number;
}
