import { IsEnum, IsOptional } from 'class-validator';
import { GetConfessionsDto } from './get-confessions.dto';
import { ModerationStatus } from '../../moderation/ai-moderation.service';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetUserConfessionsDto extends GetConfessionsDto {
  @ApiPropertyOptional({
    enum: ModerationStatus,
    description: 'Filter by moderation status',
  })
  @IsOptional()
  @IsEnum(ModerationStatus)
  status?: ModerationStatus;
}
