import { BadRequestException, HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception';
import { ErrorCode } from './error-codes';

describe('AppException', () => {
  it('normalizes validation message arrays into a readable message with field details', () => {
    const exception = new BadRequestException({
      message: ['q should not be empty', 'limit must not be greater than 50'],
    });

    const appException = AppException.fromHttpException(exception);
    const response = appException.getResponse() as any;

    expect(appException.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(response.code).toBe(ErrorCode.BAD_REQUEST);
    expect(response.message).toBe(
      'q should not be empty; limit must not be greater than 50',
    );
    expect(response.details).toEqual({
      errors: [
        { field: 'q', message: 'q should not be empty' },
        { field: 'limit', message: 'limit must not be greater than 50' },
      ],
    });
  });
});
