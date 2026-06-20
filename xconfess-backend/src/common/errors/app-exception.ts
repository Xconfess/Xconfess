import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface AppExceptionResponse {
  message: string;
  code: ErrorCode;
  details?: unknown;
}

interface HttpExceptionObjectResponse {
  message?: string | string[];
  code?: ErrorCode;
  details?: unknown;
}

export class AppException extends HttpException {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    details?: unknown,
  ) {
    super({ message, code, details }, status);
  }

  static fromHttpException(exception: HttpException): AppException {
    const response = exception.getResponse();
    const status = exception.getStatus() as HttpStatus;
    let message = exception.message;
    let code = ErrorCode.INTERNAL_SERVER_ERROR;
    let details: unknown;

    if (typeof response === 'object' && response !== null) {
      const res = response as HttpExceptionObjectResponse;
      const responseMessage = res.message;
      if (Array.isArray(responseMessage)) {
        const validationMessages = responseMessage.map((item: unknown) =>
          String(item),
        );
        message = validationMessages.join('; ') || message;
        details =
          res.details || this.buildValidationDetails(validationMessages);
      } else {
        message = responseMessage || message;
        details = res.details;
      }
      code = res.code || this.mapStatusToCode(status);
    } else {
      message = typeof response === 'string' ? response : message;
      code = this.mapStatusToCode(status);
    }

    return new AppException(message, code as ErrorCode, status, details);
  }

  private static buildValidationDetails(messages: string[]) {
    return {
      errors: messages.map((validationMessage) => ({
        field: this.extractValidationField(validationMessage),
        message: validationMessage,
      })),
    };
  }

  private static extractValidationField(message: string): string {
    const eachValueMatch = message.match(/^each value in ([\w.-]+)\s/);
    if (eachValueMatch?.[1]) {
      return eachValueMatch[1];
    }

    const fieldMatch = message.match(/^([\w.-]+)\s/);
    return fieldMatch?.[1] || 'request';
  }

  private static mapStatusToCode(status: HttpStatus): ErrorCode {
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
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.THROTTLED;
      default:
        return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
