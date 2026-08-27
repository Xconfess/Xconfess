import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface AppExceptionResponse {
  message: string;
  code: ErrorCode;
  details?: any;
  retryAfter?: number;
}

export class AppException extends HttpException {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    details?: any,
    retryAfter?: number,
  ) {
    super({ message, code, details, retryAfter }, status);
  }

  static fromHttpException(exception: HttpException): AppException {
    const response = exception.getResponse();
    const status = exception.getStatus();
    let message = exception.message;
    let code = ErrorCode.INTERNAL_SERVER_ERROR;
    let details: any;
    let retryAfter: number | undefined;

    if (typeof response === 'object' && response !== null) {
      const res = response as any;
      message = res.message || message;
      code = res.code || this.mapStatusToCode(status);
      details = res.details;
      retryAfter = res.retryAfter;
    } else {
      message = typeof response === 'string' ? response : message;
      code = this.mapStatusToCode(status);
    }

    return new AppException(message, code as ErrorCode, status, details, retryAfter);
  }

  private static mapStatusToCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.AUTH_FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.GONE:
        return ErrorCode.RESOURCE_GONE;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.UNPROCESSABLE_ENTITY;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ErrorCode.REQUEST_TOO_LARGE;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMIT_EXCEEDED;
      default:
        return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
