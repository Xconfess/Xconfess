import { IsDate, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class ScheduleConfessionDto {
  @IsDateString()
  publishAt: string;
}
