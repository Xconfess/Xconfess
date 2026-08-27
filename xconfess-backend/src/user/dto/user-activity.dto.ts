import { ApiProperty } from '@nestjs/swagger';

export enum ActivityType {
  CONFESSION = 'confession',
  COMMENT = 'comment',
  REACTION = 'reaction',
  REPORT = 'report',
}

export class ActivityMetadataDto {
  @ApiProperty({ description: 'Emoji used in reaction', required: false })
  emoji?: string;

  @ApiProperty({ description: 'ID of the associated confession', required: false })
  confessionId?: string;

  @ApiProperty({ description: 'Whether the confession is anchored on Stellar', required: false })
  isAnchored?: boolean;

  @ApiProperty({ description: 'Stellar transaction hash', required: false })
  stellarTxHash?: string;

  @ApiProperty({ description: 'Reason for the report', required: false })
  reason?: string;

  @ApiProperty({ description: 'Current status of the report', required: false })
  status?: string;
}

export class UserActivityDto {
  @ApiProperty({ description: 'Unique identifier for the activity event' })
  id: string | number;

  @ApiProperty({ enum: ActivityType, description: 'Type of activity' })
  type: ActivityType;

  @ApiProperty({ description: 'Content of the activity (e.g., confession message or comment text)', required: false })
  content?: string;

  @ApiProperty({ type: ActivityMetadataDto, description: 'Additional metadata for the activity' })
  metadata: ActivityMetadataDto;

  @ApiProperty({ description: 'Timestamp of the activity' })
  createdAt: Date;
}

export class PaginatedUserActivityDto {
  @ApiProperty({ type: [UserActivityDto] })
  data: UserActivityDto[];

  @ApiProperty()
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
