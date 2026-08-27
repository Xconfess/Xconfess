import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { CursorPaginationDto } from '../../common/pagination/cursor-pagination.dto';

export enum SortOrder {
  TRENDING = 'trending',
  NEWEST = 'newest',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export class GetConfessionsDto extends CursorPaginationDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsEnum(SortOrder)
  sort?: SortOrder = SortOrder.NEWEST;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}
