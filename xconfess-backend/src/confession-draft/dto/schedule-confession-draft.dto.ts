import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsTimeZone,
} from 'class-validator';

export class ScheduleConfessionDraftDto {
  @IsDateString()
  @IsNotEmpty()
  scheduledFor: string;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
