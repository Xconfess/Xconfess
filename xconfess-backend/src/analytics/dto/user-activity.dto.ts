import { ApiProperty } from '@nestjs/swagger';

export class DailyActivityDto {
  @ApiProperty({ description: 'Date' })
  date: string;

  @ApiProperty({ description: 'Number of active users' })
  activeUsers: number;

  @ApiProperty({
    description: 'Privacy flag: true if count is below minimum cohort threshold',
    required: false,
  })
  suppressed?: boolean;
}

export class UserActivityDto {
  @ApiProperty({ description: 'Time period analyzed' })
  period: string;

  @ApiProperty({
    description: 'Daily activity breakdown',
    type: [DailyActivityDto],
  })
  dailyActivity: DailyActivityDto[];

  @ApiProperty({ description: 'Average daily active users' })
  averageDAU: number;
}
