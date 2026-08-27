import {
  IsString,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsArray,
  Matches,
} from 'class-validator';

export class CreateFeatureFlagDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Flag name must contain only letters, numbers, underscores, hyphens, and dots',
  })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsBoolean()
  enabled: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  percentage: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsString()
  lastChangedBy?: string;
}

export class UpdateFeatureFlagDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsString()
  lastChangedBy?: string;
}
