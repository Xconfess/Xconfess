import { IsEnum, IsOptional, IsUUID, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CursorPaginationDto } from '../../common/pagination/cursor-pagination.dto';
import { Transform } from 'class-transformer';

export enum MessageSortField {
  CREATED_AT = 'createdAt',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * Query params for GET /messages.
 * Pagination bounds are inherited from CursorPaginationDto.
 */
export class GetMessagesQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: '1-indexed page number for legacy offset pagination.',
    example: 1,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Filter to a specific confession UUID.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'confession_id must be a valid UUID.' })
  confession_id?: string;

  @ApiPropertyOptional({
    description: 'Filter to a specific sender anonymous ID.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'sender_id must be a valid UUID.' })
  sender_id?: string;

  @ApiPropertyOptional({
    description: 'Filter to a specific conversation UUID.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'conversationId must be a valid UUID.' })
  conversationId?: string;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.ASC })
  @IsOptional()
  @IsEnum(SortOrder, {
    message: `sortOrder must be one of: ${Object.values(SortOrder).join(', ')}`,
  })
  sortOrder?: SortOrder = SortOrder.ASC;
}
