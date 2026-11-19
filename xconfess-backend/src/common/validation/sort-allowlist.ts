import { ErrorUtils } from '../errors/error-utils';

export const AUDIT_LOG_SORT_FIELDS = [
  'createdAt',
  'actor',
  'action',
  'target',
] as const;

export const REPORT_SORT_FIELDS = [
  'id',
  'createdAt',
  'status',
  'reason',
] as const;

export const SEARCH_SORT_FIELDS = ['relevance', 'createdAt', 'trending'] as const;

export const SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AuditLogSortField = (typeof AUDIT_LOG_SORT_FIELDS)[number];
export type ReportSortField = (typeof REPORT_SORT_FIELDS)[number];
export type SearchSortField = (typeof SEARCH_SORT_FIELDS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

const AUDIT_LOG_SORT_COLUMNS: Record<AuditLogSortField, string> = {
  createdAt: 'audit_log.createdAt',
  actor: 'admin.username',
  action: 'audit_log.action',
  target: 'audit_log.entity_type',
};

const REPORT_SORT_COLUMNS: Record<ReportSortField, string> = {
  id: 'report.id',
  createdAt: 'report.createdAt',
  status: 'report.status',
  reason: 'report.reason',
};

const SEARCH_SORT_COLUMNS: Record<SearchSortField, string> = {
  relevance: 'relevance',
  createdAt: 'created_at',
  trending: 'search_score_tiebreaker',
};

export function validateSortField<T extends string>(
  value: string | undefined | null,
  allowed: readonly T[],
  fallback: T,
  fieldName = 'sortBy',
): T {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }

  throw ErrorUtils.validationFailed(`Invalid ${fieldName}`, {
    fields: {
      [fieldName]: [`Must be one of: ${allowed.join(', ')}`],
    },
    allowedValues: [...allowed],
  });
}

export function validateSortDirection(
  value: string | undefined | null,
  fallback: SortDirection = 'DESC',
  fieldName = 'sortOrder',
): SortDirection {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = value.toUpperCase();
  if ((SORT_DIRECTIONS as readonly string[]).includes(normalized)) {
    return normalized as SortDirection;
  }

  throw ErrorUtils.validationFailed(`Invalid ${fieldName}`, {
    fields: {
      [fieldName]: [`Must be one of: ${SORT_DIRECTIONS.join(', ')}`],
    },
    allowedValues: [...SORT_DIRECTIONS],
  });
}

export function resolveSortField<T extends string>(
  value: string | undefined | null,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value !== 'string') {
    return fallback;
  }

  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function resolveAuditLogSortColumn(value?: string | null): string {
  return AUDIT_LOG_SORT_COLUMNS[
    resolveSortField(value, AUDIT_LOG_SORT_FIELDS, 'createdAt')
  ];
}

export function resolveReportSortColumn(value?: string | null): string {
  return REPORT_SORT_COLUMNS[
    resolveSortField(value, REPORT_SORT_FIELDS, 'createdAt')
  ];
}

export function resolveSearchSortExpression(value?: string | null): string {
  const [rawField, rawDirection] = (value ?? '').trim().split(/\s+/);
  const field = resolveSortField(
    rawField,
    SEARCH_SORT_FIELDS,
    'relevance',
  );
  const direction =
    rawDirection?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  return `${SEARCH_SORT_COLUMNS[field]} ${direction}`;
}
