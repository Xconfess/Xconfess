import { HttpException, HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception';
import { ErrorCode } from './error-codes';

describe('AppException', () => {
  it('should create an instance with default values', () => {
    const exception = new AppException('Test error');
    const response: any = exception.getResponse();
    expect(response.message).toBe('Test error');
    expect(response.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(exception.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('should create an instance with custom values', () => {
    const exception = new AppException(
      'Not found',
      ErrorCode.NOT_FOUND,
      HttpStatus.NOT_FOUND,
      { id: 1 },
    );
    const response: any = exception.getResponse();
    expect(response.message).toBe('Not found');
    expect(response.code).toBe(ErrorCode.NOT_FOUND);
    expect(response.details).toEqual({ id: 1 });
    expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('should create from standard HttpException', () => {
    const httpException = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
    const appException = AppException.fromHttpException(httpException);
    const response: any = appException.getResponse();
    expect(response.message).toBe('Bad request');
    expect(response.code).toBe(ErrorCode.BAD_REQUEST);
    expect(appException.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('should create from HttpException with custom response', () => {
    const httpException = new HttpException(
      { message: 'Custom', code: 'CUSTOM_CODE', details: 'info' },
      HttpStatus.BAD_REQUEST,
    );
    const appException = AppException.fromHttpException(httpException);
    const response: any = appException.getResponse();
    expect(response.message).toBe('Custom');
    expect(response.code).toBe('CUSTOM_CODE');
    expect(response.details).toBe('info');
  });
});
