import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { ErrorCode } from '../errors/error-codes';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockArgumentsHost: ArgumentsHost;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HttpExceptionFilter],
    }).compile();

    filter = module.get<HttpExceptionFilter>(HttpExceptionFilter);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      url: '/test',
      path: '/test',
      method: 'GET',
      requestId: 'test-request-id',
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should format standard HttpException correctly', () => {
    const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);
    
    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
        message: 'Test error',
        requestId: 'test-request-id',
        path: '/test',
      }),
    );
  });

  it('should handle missing requestId', () => {
    delete mockRequest.requestId;
    const exception = new HttpException('Error', HttpStatus.INTERNAL_SERVER_ERROR);

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'unknown',
      }),
    );
  });

  it('keeps internal exception messages out of the versioned public response', () => {
    const exception = new HttpException(
      'database password=private-value',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
      }),
    );
    expect(JSON.stringify(mockResponse.json.mock.calls[0][0])).not.toContain('private-value');
  });
});
