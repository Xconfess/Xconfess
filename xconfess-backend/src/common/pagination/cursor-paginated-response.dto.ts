import { ApiProperty } from '@nestjs/swagger';

export class CursorPaginationMeta {
  @ApiProperty({
    description: 'The cursor for the next page of results.',
    example: 'eyJpZCI6MTIzLCJjcmVhdGVkQXQiOiIyMDI0LTAxLTAxVDAwOjAwOjAwWiJ9',
    nullable: true,
  })
  nextCursor: string | null;

  @ApiProperty({
    description: 'Whether there are more results available.',
    example: true,
  })
  hasMore: boolean;

  @ApiProperty({
    description: 'The number of items requested in this page.',
    example: 20,
  })
  limit: number;
}

export class CursorPaginatedResponseDto<T> {
  @ApiProperty()
  data: T[];

  @ApiProperty({ description: 'Cursor for the next page', nullable: true })
  nextCursor: string | null;

  @ApiProperty({ description: 'Whether there are more results' })
  hasMore: boolean;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  constructor(
    data: T[],
    nextCursor: string | null,
    hasMore: boolean,
    limit: number,
  ) {
    this.data = data;
    this.nextCursor = nextCursor;
    this.hasMore = hasMore;
    this.limit = limit;
  }
}
