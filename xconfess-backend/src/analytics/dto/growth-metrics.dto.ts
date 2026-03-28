import { ApiProperty } from '@nestjs/swagger';

export class DailyGrowthDto {
  @ApiProperty({ description: 'Date' })
  date: string;

  @ApiProperty({ description: 'Number of confessions created' })
  count: number;
}

export class NumericDeltaDto {
  @ApiProperty({
    description: 'Absolute difference between current and previous windows',
  })
  absoluteChange: number;

  @ApiProperty({
    description: 'Percentage difference relative to the previous window',
    nullable: true,
  })
  percentageChange: number | null;
}

export class WindowRangeDto {
  @ApiProperty({ description: 'Inclusive range start in ISO-8601 format' })
  startAt: string;

  @ApiProperty({ description: 'Exclusive range end in ISO-8601 format' })
  endAt: string;
}

export class ComparisonWindowDto {
  @ApiProperty({ description: 'Requested logical window size in days' })
  requestedDays: number;

  @ApiProperty({
    description: 'Bucket granularity used to aggregate the metrics',
  })
  bucketUnit: 'day';

  @ApiProperty({
    description: 'Number of buckets included in each returned window',
  })
  bucketCount: number;

  @ApiProperty({ type: WindowRangeDto })
  current: WindowRangeDto;

  @ApiProperty({ type: WindowRangeDto })
  previous: WindowRangeDto;
}

export class GrowthMetricsDto {
  @ApiProperty({ description: 'Time period analyzed' })
  period: string;

  @ApiProperty({ description: 'Total confessions in period' })
  totalConfessions: number;

  @ApiProperty({ description: 'Average confessions per day' })
  averagePerDay: number;

  @ApiProperty({
    description: 'Daily growth breakdown',
    type: [DailyGrowthDto],
  })
  dailyGrowth: DailyGrowthDto[];

  @ApiProperty({
    description: 'Growth trend',
    enum: ['increasing', 'decreasing', 'stable'],
  })
  trend: string;
}

export class GrowthMetricsComparisonDto {
  @ApiProperty({ type: ComparisonWindowDto })
  window: ComparisonWindowDto;

  @ApiProperty({ type: GrowthMetricsDto })
  current: GrowthMetricsDto;

  @ApiProperty({ type: GrowthMetricsDto })
  previous: GrowthMetricsDto;

  @ApiProperty({
    description: 'Metric deltas between current and previous windows',
    type: Object,
    additionalProperties: false,
    example: {
      totalConfessions: { absoluteChange: 12, percentageChange: 20 },
      averagePerDay: { absoluteChange: 1.71, percentageChange: 20 },
    },
  })
  delta: {
    totalConfessions: NumericDeltaDto;
    averagePerDay: NumericDeltaDto;
  };
}
