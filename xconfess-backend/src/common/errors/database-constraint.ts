import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception';
import { ErrorCode } from './error-codes';

/**
 * Convert PostgreSQL constraint failures into stable, client-safe errors.
 *
 * TypeORM copies the driver's SQLSTATE code onto QueryFailedError.  We use
 * that code rather than the driver message or constraint name so SQL details
 * never cross the HTTP boundary. Unknown database errors intentionally return
 * null and remain the responsibility of the catch-all error path.
 */
export function normalizeDatabaseConstraintError(
  error: unknown,
): AppException | null {
  const code = readDriverCode(error);

  switch (code) {
    case '23505':
      return new AppException(
        'The requested resource already exists.',
        ErrorCode.ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    case '23503':
      return new AppException(
        'The requested operation references a resource that is not available.',
        ErrorCode.CONFLICT,
        HttpStatus.CONFLICT,
      );
    case '23502':
    case '23514':
      return new AppException(
        'The request contains invalid data.',
        ErrorCode.VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
      );
    default:
      return null;
  }
}

function readDriverCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const driverError = error as {
    code?: unknown;
    driverError?: { code?: unknown };
  };
  const code = driverError.code ?? driverError.driverError?.code;
  return typeof code === 'string' ? code : undefined;
}
