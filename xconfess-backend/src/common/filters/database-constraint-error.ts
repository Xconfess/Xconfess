import { ErrorCode } from '../errors/error-codes';

export type DatabaseConstraintResponse = {
  status: number;
  code: ErrorCode;
  message: string;
};

const CONSTRAINT_RESPONSES: Record<string, DatabaseConstraintResponse> = {
  '23505': {
    status: 409,
    code: ErrorCode.CONFLICT,
    message: 'Resource already exists',
  },
  '23503': {
    status: 400,
    code: ErrorCode.BAD_REQUEST,
    message: 'Referenced resource does not exist',
  },
  '23502': {
    status: 400,
    code: ErrorCode.BAD_REQUEST,
    message: 'Required field is missing',
  },
  '23514': {
    status: 400,
    code: ErrorCode.BAD_REQUEST,
    message: 'Request violates a data constraint',
  },
  '23P01': {
    status: 409,
    code: ErrorCode.CONFLICT,
    message: 'Resource conflicts with existing data',
  },
};

function readConstraintCode(exception: unknown): string | undefined {
  if (!exception || typeof exception !== 'object') return undefined;
  const value = exception as {
    code?: unknown;
    driverError?: { code?: unknown };
  };
  const code = value.code ?? value.driverError?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Convert known PostgreSQL constraint failures into stable, client-safe API
 * responses. SQL text, constraint names, and driver messages are deliberately
 * excluded from the returned response.
 */
export function classifyDatabaseConstraintError(
  exception: unknown,
): DatabaseConstraintResponse | undefined {
  const code = readConstraintCode(exception);
  return code ? CONSTRAINT_RESPONSES[code] : undefined;
}

export function databaseConstraintCode(exception: unknown): string | undefined {
  return readConstraintCode(exception);
}
