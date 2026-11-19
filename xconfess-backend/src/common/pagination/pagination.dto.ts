import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PAGINATION, PAGINATION_MESSAGES } from './pagination.constants';

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
    maximum: PAGINATION.MAX_PAGE,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: PAGINATION_MESSAGES.PAGE_INTEGER })
  @Min(PAGINATION.MIN_PAGE, {
    message: PAGINATION_MESSAGES.PAGE_MIN,
  })
  @Max(PAGINATION.MAX_PAGE, {
    message: PAGINATION_MESSAGES.PAGE_MAX,
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
  @IsInt({ message: PAGINATION_MESSAGES.LIMIT_INTEGER })
  @Min(PAGINATION.MIN_LIMIT, {
    message: PAGINATION_MESSAGES.LIMIT_MIN,
  })
  @Max(PAGINATION.MAX_LIMIT, {
    message: PAGINATION_MESSAGES.LIMIT_MAX,
  })
  limit?: number = PAGINATION.DEFAULT_LIMIT;
}
