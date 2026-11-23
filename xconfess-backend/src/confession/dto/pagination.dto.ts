import { Type } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';
import { PAGINATION } from '../../common/pagination/pagination.constants';

export class PaginationDto {
  @Type(() => Number)
  @IsInt({ message: `page must be an integer.` })
  @Min(PAGINATION.MIN_PAGE, {
    message: `page must be at least ${PAGINATION.MIN_PAGE}.`,
  })
  page: number = PAGINATION.DEFAULT_PAGE;

  @Type(() => Number)
  @IsInt({ message: `limit must be an integer.` })
  @Min(PAGINATION.MIN_LIMIT, {
    message: `limit must be at least ${PAGINATION.MIN_LIMIT}.`,
  })
  @Max(PAGINATION.MAX_LIMIT, {
    message: `limit must not exceed ${PAGINATION.MAX_LIMIT}.`,
  })
  limit: number = PAGINATION.DEFAULT_LIMIT;
}
