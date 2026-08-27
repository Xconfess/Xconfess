import { createRequestContext, RequestContextStorage, injectRequestId } from './request-context';

describe('createRequestContext', () => {
  it('returns undefined from getRequestId before any ID is set', () => {
    const ctx = createRequestContext();
    expect(ctx.getRequestId()).toBeUndefined();
  });

  it('generates a non-empty string ID', () => {
    const ctx = createRequestContext();
    const id = ctx.generateId();
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('stores and retrieves a request ID', () => {
    const ctx = createRequestContext();
    ctx.setRequestId('test-id');
    expect(ctx.getRequestId()).toBe('test-id');
  });

  it('runs a function within a scoped context', async () => {
    const ctx = createRequestContext();
    const result = await ctx.runWithContext('ctx-id', async () => {
      expect(ctx.getRequestId()).toBe('ctx-id');
      return 'done';
    });
    expect(result).toBe('done');
    expect(ctx.getRequestId()).toBeUndefined();
  });

  it('cleans up even when the function throws', async () => {
    const ctx = createRequestContext();
    await expect(
      ctx.runWithContext('fail-id', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(ctx.getRequestId()).toBeUndefined();
  });

  it('supports nested runWithContext', async () => {
    const ctx = createRequestContext();
    const result = await ctx.runWithContext('outer', async () => {
      expect(ctx.getRequestId()).toBe('outer');
      const inner = await ctx.runWithContext('inner', async () => {
        expect(ctx.getRequestId()).toBe('inner');
        return 'nested';
      });
      expect(ctx.getRequestId()).toBe('outer');
      return inner;
    });
    expect(result).toBe('nested');
    expect(ctx.getRequestId()).toBeUndefined();
  });

  it('supports multiple independent contexts', () => {
    const a = createRequestContext();
    const b = createRequestContext();
    a.setRequestId('id-a');
    b.setRequestId('id-b');
    expect(a.getRequestId()).toBe('id-a');
    expect(b.getRequestId()).toBe('id-b');
  });
});

describe('RequestContextStorage', () => {
  it('returns undefined before set', () => {
    const storage = new RequestContextStorage();
    expect(storage.getRequestId()).toBeUndefined();
  });

  it('returns undefined after clear', () => {
    const storage = new RequestContextStorage();
    storage.setRequestId('some-id');
    storage.clear();
    expect(storage.getRequestId()).toBeUndefined();
  });
});

describe('injectRequestId', () => {
  it('adds requestId to job data when provided', () => {
    const result = injectRequestId({ type: 'test' }, 'req-123');
    expect(result.requestId).toBe('req-123');
    expect(result.type).toBe('test');
  });

  it('returns data unchanged when requestId is empty', () => {
    const data = { type: 'test' };
    const result = injectRequestId(data, '');
    expect(result).toEqual(data);
    expect(result.requestId).toBeUndefined();
  });

  it('returns data unchanged when requestId is undefined', () => {
    const data = { type: 'test' };
    const result = injectRequestId(data, undefined);
    expect(result).toEqual(data);
    expect(result.requestId).toBeUndefined();
  });
});
