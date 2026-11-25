import { IsOptional, IsInt, Max, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { SortOrder } from './get-confessions.dto';
import { CursorPaginationDto } from '../../common/pagination/cursor-pagination.dto';
import {
  PAGINATION,
  PAGINATION_MESSAGES,
} from '../../common/pagination/pagination.constants';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetConfessionsByTagDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: '1-indexed page number for legacy offset pagination.',
    example: 1,
    minimum: PAGINATION.MIN_PAGE,
    maximum: PAGINATION.MAX_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: PAGINATION_MESSAGES.PAGE_INTEGER })
  @Min(PAGINATION.MIN_PAGE, { message: PAGINATION_MESSAGES.PAGE_MIN })
  @Max(PAGINATION.MAX_PAGE, { message: PAGINATION_MESSAGES.PAGE_MAX })
  page?: number = 1;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.NEWEST })
  @IsOptional()
  @IsEnum(SortOrder)
  sort?: SortOrder = SortOrder.NEWEST;
}
