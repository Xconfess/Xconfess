import {
  isSearchQueryTimeoutError,
  SEARCH_TIMEOUT_MESSAGE,
} from './search-query-timeout';

describe('isSearchQueryTimeoutError', () => {
  it('detects PostgreSQL query_canceled (SQLSTATE 57014)', () => {
    expect(isSearchQueryTimeoutError({ code: '57014' })).toBe(true);
  });

  it('detects a TypeORM-style error that only carries the driver error', () => {
    const wrapped = { driverError: { code: '57014' } };

    expect(isSearchQueryTimeoutError(wrapped)).toBe(true);
  });

  it('detects a statement timeout by message when no code is present', () => {
    const error = new Error('canceling statement due to statement timeout');

    expect(isSearchQueryTimeoutError(error)).toBe(true);
  });

  it('ignores unrelated database and application errors', () => {
    expect(isSearchQueryTimeoutError({ code: '23505' })).toBe(false);
    expect(isSearchQueryTimeoutError(new Error('connection reset'))).toBe(false);
    expect(isSearchQueryTimeoutError(null)).toBe(false);
    expect(isSearchQueryTimeoutError('statement timeout')).toBe(false);
  });

  it('exposes a generic message that does not mention the search term', () => {
    expect(SEARCH_TIMEOUT_MESSAGE).toBe(
      'Search took too long to complete. Please try a narrower search.',
    );
  });
});
