import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { ErrorCode } from '../errors/error-codes';
import { ErrorUtils } from '../errors/error-utils';
import { StellarRpcUnavailableException } from '../../stellar/utils/rpc-rate-limit';

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

  // Issue #2279: Stellar RPC throttling surfaces as a safe 503 with Retry-After.
  it('returns a safe 503 with a Retry-After header for an unavailable dependency', () => {
    mockResponse.setHeader = jest.fn();
    const exception = new StellarRpcUnavailableException(30);

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '30');
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Service temporarily unavailable. Please retry later.',
        retryAfter: 30,
      }),
    );
  });

  it('does not echo upstream details in a 503 body', () => {
    mockResponse.setHeader = jest.fn();
    const exception = ErrorUtils.serviceUnavailable(
      'stellar-rpc',
      'upstream said: key=provider-secret',
      10,
    );

    filter.catch(exception, mockArgumentsHost);

    const body = JSON.stringify(mockResponse.json.mock.calls[0][0]);
    expect(body).not.toContain('provider-secret');
    expect(body).not.toContain('stellar-rpc');
  });
});
