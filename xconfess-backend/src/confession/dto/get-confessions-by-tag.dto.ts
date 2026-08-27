import { IsOptional, IsInt, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { SortOrder } from './get-confessions.dto';
import { CursorPaginationDto } from '../../common/pagination/cursor-pagination.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetConfessionsByTagDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: '1-indexed page number for legacy offset pagination.',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.NEWEST })
  @IsOptional()
  @IsEnum(SortOrder)
  sort?: SortOrder = SortOrder.NEWEST;
}
