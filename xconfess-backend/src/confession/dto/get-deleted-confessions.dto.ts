import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto, PAGINATION } from '../../common/pagination';

/**
 * Query params for `GET /confessions/deleted` (admin).
 *
 * Uses the shared page/limit bounds (Issue #2117). The default page size stays
 * at 50 to preserve the endpoint's existing response shape for callers that
 * omit `limit`.
 */
export class GetDeletedConfessionsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: `Items per page. Maximum ${PAGINATION.MAX_LIMIT}.`,
    default: 50,
    minimum: PAGINATION.MIN_LIMIT,
    maximum: PAGINATION.MAX_LIMIT,
    example: 50,
  })
  limit?: number = 50;
}
