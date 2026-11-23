import { ErrorCode } from '../errors/error-codes';
import {
  classifyDatabaseConstraintError,
  databaseConstraintCode,
} from './database-constraint-error';

describe('database constraint error classification', () => {
  it('maps unique violations to a safe conflict response', () => {
    const result = classifyDatabaseConstraintError({
      driverError: { code: '23505', detail: 'private SQL detail' },
    });

    expect(result).toEqual({
      status: 409,
      code: ErrorCode.CONFLICT,
      message: 'Resource already exists',
    });
    expect(result?.message).not.toContain('private SQL detail');
  });

  it.each([
    ['23503', 400, ErrorCode.BAD_REQUEST],
    ['23502', 400, ErrorCode.BAD_REQUEST],
    ['23514', 400, ErrorCode.BAD_REQUEST],
    ['23P01', 409, ErrorCode.CONFLICT],
  ])(
    'maps PostgreSQL code %s without exposing driver text',
    (code, status, errorCode) => {
      expect(
        classifyDatabaseConstraintError({ code, detail: 'do not expose' }),
      ).toMatchObject({
        status,
        code: errorCode,
      });
    },
  );

  it('leaves unknown failures for the normal unexpected-error path', () => {
    const error = new Error('database unavailable');
    expect(classifyDatabaseConstraintError(error)).toBeUndefined();
    expect(databaseConstraintCode(error)).toBeUndefined();
  });
});
