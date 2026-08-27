import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PAGINATION } from './pagination.constants';

/**
 * Extend this class in every list-endpoint DTO that needs page/limit params.
 *
 * All constraints are applied by the global ValidationPipe. No clamping is
 * performed — invalid values return 400 with a human-readable message so the
 * caller knows exactly what to fix.
 */
export class PaginationDto {
  @ApiPropertyOptional({
    description: '1-indexed page number.',
    default: PAGINATION.DEFAULT_PAGE,
    minimum: PAGINATION.MIN_PAGE,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer.' })
  @Min(PAGINATION.MIN_PAGE, {
    message: `page must be at least ${PAGINATION.MIN_PAGE}.`,
  })
  page?: number = PAGINATION.DEFAULT_PAGE;

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
