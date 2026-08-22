import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ModerationStatus } from '../ai-moderation.service';

export class QueryModerationDto {
  @IsOptional()
  @IsEnum(ModerationStatus)
  status?: ModerationStatus;

  @IsOptional()
  @IsString()
  search?: string; // matches confessionId / userId / content substring

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize: number = 20;
}