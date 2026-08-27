import { IsInt, IsOptional, Max, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PAGINATION } from './pagination.constants';

export class CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor for pagination.',
    example: 'eyJpZCI6MTIzLCJjcmVhdGVkQXQiOiIyMDI0LTAxLTAxVDAwOjAwOjAwWiJ9',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: `Items per page. Maximum ${PAGINATION.MAX_LIMIT}.`,
    default: PAGINATION.DEFAULT_LIMIT,
    minimum: PAGINATION.MIN_LIMIT,
    maximum: PAGINATION.MAX_LIMIT,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer.' })
  @Min(PAGINATION.MIN_LIMIT, {
    message: `limit must be at least ${PAGINATION.MIN_LIMIT}.`,
  })
  @Max(PAGINATION.MAX_LIMIT, {
    message: `limit must not exceed ${PAGINATION.MAX_LIMIT}.`,
  })
  limit?: number = PAGINATION.DEFAULT_LIMIT;
}
