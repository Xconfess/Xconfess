// src/confession/dto/search-confession.dto.ts
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDate,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateIf,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAGINATION,
  PAGINATION_MESSAGES,
} from '../../common/pagination/pagination.constants';

export enum SortBy {
  REACTIONS = 'reactions',
  DATE = 'date',
  VIEWS = 'views',
  RELEVANCE = 'relevance',
}

const SEARCH_QUERY_MAX_LENGTH = 120;
// Allow Unicode letters, numbers and combining marks (vowel signs, accents) + common separators/punctuation used in search.
const SEARCH_QUERY_ALLOWED_CHARS =
  /^[\p{L}\p{M}\p{N}\p{Zs}.,!?'"@#$%&*()_\-:+/[\]{}]+$/u;

export class SearchConfessionDto {
  @ApiProperty({
    description: 'Search query string',
    example: 'work stress',
    minLength: 1,
    maxLength: SEARCH_QUERY_MAX_LENGTH,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(SEARCH_QUERY_MAX_LENGTH, {
    message: `q must not exceed ${SEARCH_QUERY_MAX_LENGTH} characters`,
  })
  @Matches(SEARCH_QUERY_ALLOWED_CHARS, {
    message:
      'q contains unsupported characters; use letters, numbers, spaces, or common punctuation',
  })
  q: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    minimum: PAGINATION.MIN_PAGE,
    maximum: PAGINATION.MAX_PAGE,
    default: PAGINATION.DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: PAGINATION_MESSAGES.PAGE_INTEGER })
  @Min(PAGINATION.MIN_PAGE, { message: PAGINATION_MESSAGES.PAGE_MIN })
  @Max(PAGINATION.MAX_PAGE, { message: PAGINATION_MESSAGES.PAGE_MAX })
  page?: number = PAGINATION.DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: 'Number of results per page',
    example: 10,
    minimum: PAGINATION.MIN_LIMIT,
    maximum: PAGINATION.MAX_LIMIT,
    default: PAGINATION.DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: PAGINATION_MESSAGES.LIMIT_INTEGER })
  @Min(PAGINATION.MIN_LIMIT, { message: PAGINATION_MESSAGES.LIMIT_MIN })
  @Max(PAGINATION.MAX_LIMIT, { message: PAGINATION_MESSAGES.LIMIT_MAX })
  limit?: number = PAGINATION.DEFAULT_LIMIT;

  // ===== NEW ADVANCED FILTERS =====

  @ApiPropertyOptional({
    description: 'Filter by gender',
    example: 'male',
    enum: ['male', 'female', 'other'],
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({
    description: 'Start date for date range filter (ISO 8601)',
    example: '2025-01-01T00:00:00Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date for date range filter (ISO 8601)',
    example: '2025-01-24T23:59:59Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @ValidateIf((o) => o.startDate !== undefined)
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Minimum reaction count',
    example: 10,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0)
  minReactions?: number;

  @ApiPropertyOptional({
    description: 'Maximum reaction count',
    example: 100,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.minReactions !== undefined)
  maxReactions?: number;

  @ApiPropertyOptional({
    description: 'Minimum view count',
    example: 50,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0)
  minViews?: number;

  @ApiPropertyOptional({
    description: 'Maximum view count',
    example: 1000,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.minViews !== undefined)
  maxViews?: number;

  @ApiPropertyOptional({
    description: 'Filter by tags (comma-separated or array)',
    example: 'motivation,career',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
    return Array.isArray(value) ? value : [];
  })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Show only anonymous confessions',
    example: true,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value === 'true';
    }
    return value === true;
  })
  @IsBoolean()
  anonymousOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Sort results by',
    enum: SortBy,
    example: SortBy.REACTIONS,
    default: SortBy.RELEVANCE,
  })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.RELEVANCE;

  @ApiPropertyOptional({
    description: 'Only show confessions that require moderation review',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value === 'true';
    }
    return value === true;
  })
  @IsBoolean()
  requiresReview?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by moderation status',
    example: 'approved',
    enum: ['approved', 'pending', 'flagged', 'rejected'],
  })
  @IsOptional()
  @IsString()
  moderationStatus?: string;
}
