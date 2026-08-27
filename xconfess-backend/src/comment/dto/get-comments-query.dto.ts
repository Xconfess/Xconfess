import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { CursorPaginationDto } from '../../common/pagination/cursor-pagination.dto';
import { Transform } from 'class-transformer';

export enum CommentSortField {
  CREATED_AT = 'createdAt',
  ID = 'id',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * Query params for GET /confessions/:id/comments.
 * Supports both cursor-based and offset-based pagination.
 */
export class GetCommentsQueryDto extends CursorPaginationDto {
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
    enum: CommentSortField,
    default: CommentSortField.CREATED_AT,
  })
  @ApiPropertyOptional({
    enum: CommentSortField,
    default: CommentSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(CommentSortField, {
    message: `sortField must be one of: ${Object.values(CommentSortField).join(', ')}`,
  })
  sortField?: CommentSortField = CommentSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder, {
    message: `sortOrder must be one of: ${Object.values(SortOrder).join(', ')}`,
  })
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({
    description: 'Include replies to deleted/hidden parent comments',
    default: false,
  })
  @IsOptional()
  includeOrphanedReplies?: boolean = false;
}
