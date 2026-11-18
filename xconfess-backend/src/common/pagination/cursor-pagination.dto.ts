import { IsInt, IsOptional, Max, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PAGINATION, PAGINATION_MESSAGES } from './pagination.constants';
import { IsValidCursor } from './cursor-validation.decorator';

export class CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor for pagination.',
    example: 'eyJpZCI6MTIzLCJjcmVhdGVkQXQiOiIyMDI0LTAxLTAxVDAwOjAwOjAwWiJ9',
  })
  @IsOptional()
  @IsString()
  @IsValidCursor()
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
  @IsInt({ message: PAGINATION_MESSAGES.LIMIT_INTEGER })
  @Min(PAGINATION.MIN_LIMIT, {
    message: PAGINATION_MESSAGES.LIMIT_MIN,
  })
  @Max(PAGINATION.MAX_LIMIT, {
    message: PAGINATION_MESSAGES.LIMIT_MAX,
  })
  limit?: number = PAGINATION.DEFAULT_LIMIT;
}
