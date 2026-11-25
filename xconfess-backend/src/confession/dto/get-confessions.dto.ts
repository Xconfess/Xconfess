import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CursorPaginationDto } from '../../common/pagination/cursor-pagination.dto';
import {
  PAGINATION,
  PAGINATION_MESSAGES,
} from '../../common/pagination/pagination.constants';

export enum SortOrder {
  TRENDING = 'trending',
  NEWEST = 'newest',
  MOST_DISCUSSED = 'most_discussed',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export class GetConfessionsDto extends CursorPaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: PAGINATION_MESSAGES.PAGE_INTEGER })
  @Min(PAGINATION.MIN_PAGE, { message: PAGINATION_MESSAGES.PAGE_MIN })
  @Max(PAGINATION.MAX_PAGE, { message: PAGINATION_MESSAGES.PAGE_MAX })
  page?: number = 1;

  @IsOptional()
  @IsEnum(SortOrder)
  sort?: SortOrder = SortOrder.NEWEST;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}
