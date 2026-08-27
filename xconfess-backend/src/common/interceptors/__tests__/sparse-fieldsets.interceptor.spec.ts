import { SparseFieldsetsInterceptor } from '../sparse-fieldsets.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('SparseFieldsetsInterceptor', () => {
  let interceptor: SparseFieldsetsInterceptor;

  beforeEach(() => {
    interceptor = new SparseFieldsetsInterceptor();
  });

  it('should pass data unchanged if no fields query param', async () => {
    const mockRequest = { query: {} };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    const mockData = { id: 1, name: 'test', age: 30 };
    const mockCallHandler = {
      handle: () => of(mockData),
    } as CallHandler;

    const result = await interceptor.intercept(mockContext, mockCallHandler).toPromise();
    expect(result).toEqual(mockData);
  });

  it('should filter fields on a single object', async () => {
    const mockRequest = { query: { fields: 'id,name' } };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    const mockData = { id: 1, name: 'test', age: 30 };
    const mockCallHandler = {
      handle: () => of(mockData),
    } as CallHandler;

    const result = await interceptor.intercept(mockContext, mockCallHandler).toPromise();
    expect(result).toEqual({ id: 1, name: 'test' });
  });

  it('should filter fields on an array of objects', async () => {
    const mockRequest = { query: { fields: 'id,name' } };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    const mockData = [
      { id: 1, name: 'test1', age: 30 },
      { id: 2, name: 'test2', age: 40 },
    ];
    const mockCallHandler = {
      handle: () => of(mockData),
    } as CallHandler;

    const result = await interceptor.intercept(mockContext, mockCallHandler).toPromise();
    expect(result).toEqual([
      { id: 1, name: 'test1' },
      { id: 2, name: 'test2' },
    ]);
  });

  it('should filter fields inside paginated response structure', async () => {
    const mockRequest = { query: { fields: 'id,name' } };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    const mockData = {
      data: [
        { id: 1, name: 'test1', age: 30 },
        { id: 2, name: 'test2', age: 40 },
      ],
      nextCursor: 'abc',
      hasMore: true,
    };
    const mockCallHandler = {
      handle: () => of(mockData),
    } as CallHandler;

    const result = await interceptor.intercept(mockContext, mockCallHandler).toPromise();
    expect(result).toEqual({
      data: [
        { id: 1, name: 'test1' },
        { id: 2, name: 'test2' },
      ],
      nextCursor: 'abc',
      hasMore: true,
    });
  });

  it('should support dot notation for nested objects', async () => {
    const mockRequest = { query: { fields: 'id,author.username' } };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    const mockData = {
      id: 1,
      title: 'post',
      author: {
        id: 10,
        username: 'john',
        email: 'john@example.com',
      },
    };
    const mockCallHandler = {
      handle: () => of(mockData),
    } as CallHandler;

    const result = await interceptor.intercept(mockContext, mockCallHandler).toPromise();
    expect(result).toEqual({
      id: 1,
      author: {
        username: 'john',
      },
    });
  });
});
