import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto, PAGINATION } from '../../common/pagination';

/**
 * Query params for the user activity/confession lists.
 *
 * Uses the shared page/limit bounds (Issue #2117) while preserving the
 * endpoint's existing default page size of 10.
 */
export class UserListQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: `Items per page. Maximum ${PAGINATION.MAX_LIMIT}.`,
    default: 10,
    minimum: PAGINATION.MIN_LIMIT,
    maximum: PAGINATION.MAX_LIMIT,
    example: 10,
  })
  limit?: number = 10;
}
