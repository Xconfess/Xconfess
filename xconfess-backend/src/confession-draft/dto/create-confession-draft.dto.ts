import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsISO8601,
  IsTimeZone,
  MaxLength,
} from 'class-validator';

export class CreateConfessionDraftDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, { message: 'Confession cannot exceed 1000 characters' })
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'scheduledFor must be a valid ISO 8601 date' })
  scheduledFor?: string;

  @IsOptional()
  @IsTimeZone({ message: 'timezone must be a valid IANA timezone' })
  timezone?: string;
}
