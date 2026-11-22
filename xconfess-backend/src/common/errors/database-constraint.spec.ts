import { HttpStatus } from '@nestjs/common';
import { normalizeDatabaseConstraintError } from './database-constraint';

describe('normalizeDatabaseConstraintError', () => {
  it.each([
    ['23505', HttpStatus.CONFLICT, 'ALREADY_EXISTS'],
    ['23503', HttpStatus.CONFLICT, 'CONFLICT'],
    ['23502', HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'],
    ['23514', HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'],
  ])(
    'maps PostgreSQL %s without exposing SQL details',
    (code, status, errorCode) => {
      const result = normalizeDatabaseConstraintError({
        code,
        detail: 'secret_table secret_column leaked value',
        constraint: 'secret_constraint_name',
      });

      expect(result?.getStatus()).toBe(status);
      expect(result?.getResponse()).toMatchObject({ code: errorCode });
      expect(JSON.stringify(result?.getResponse())).not.toContain('secret_');
    },
  );

  it('also recognizes TypeORM driverError wrappers', () => {
    expect(
      normalizeDatabaseConstraintError({ driverError: { code: '23505' } }),
    ).not.toBeNull();
  });

  it('leaves unknown database errors for the generic logging path', () => {
    expect(normalizeDatabaseConstraintError({ code: '42P01' })).toBeNull();
    expect(
      normalizeDatabaseConstraintError(new Error('connection failed')),
    ).toBeNull();
  });
});
