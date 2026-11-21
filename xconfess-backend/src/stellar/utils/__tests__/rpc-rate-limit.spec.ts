import { HttpStatus } from '@nestjs/common';
import {
  StellarRpcUnavailableException,
  backOffOrFail,
  getRetryAfterMs,
  isRateLimitError,
  planRateLimitRetry,
  rateLimitErrorFromResponse,
} from '../rpc-rate-limit';
import { handleStellarError } from '../stellar-error.handler';
import { StellarService } from '../../stellar.service';
import { TransactionBuilderService } from '../../transaction-builder.service';
import { ContractService } from '../../contract.service';
import { ErrorCode } from '../../../common/errors/error-codes';

const mockContractCall = jest.fn();
jest.mock('@stellar/stellar-sdk', () => ({
  ...jest.requireActual('@stellar/stellar-sdk'),
  nativeToScVal: jest.fn(() => ({})),
  Contract: jest.fn().mockImplementation(() => ({ call: mockContractCall })),
}));

/** axios-style error as thrown by the Stellar SDK for an HTTP 429. */
const throttled = (headers: Record<string, string> = {}) =>
  Object.assign(new Error('Request failed with status code 429'), {
    response: { status: 429, headers },
  });

const policy = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 2000 };
const rpcConfig = {
  rpcMaxRetries: 3,
  rpcRetryBaseDelayMs: 100,
  rpcRetryMaxDelayMs: 2000,
  rpcTimeoutMs: 1000,
};

describe('Stellar RPC rate-limit handling (#2279)', () => {
  describe('isRateLimitError', () => {
    it.each([
      ['axios-style response.status', throttled()],
      ['top-level status', { status: 429 }],
      ['message only', new Error('429 Too Many Requests')],
      ['rate limit wording', new Error('RPC rate limit exceeded')],
    ])('detects %s', (_label, error) => {
      expect(isRateLimitError(error)).toBe(true);
    });

    it.each([
      ['timeout', new Error('timeout of 15000ms exceeded')],
      ['500', { response: { status: 500 } }],
      ['undefined', undefined],
    ])('ignores %s', (_label, error) => {
      expect(isRateLimitError(error)).toBe(false);
    });
  });

  describe('getRetryAfterMs', () => {
    it('reads delta-seconds from plain and Headers-like objects', () => {
      expect(getRetryAfterMs(throttled({ 'Retry-After': '3' }))).toBe(3000);
      const headers = new Headers({ 'retry-after': '2' });
      expect(getRetryAfterMs({ response: { status: 429, headers } })).toBe(2000);
    });

    it('reads an HTTP date relative to now', () => {
      const now = Date.parse('2026-11-21T12:00:00Z');
      const error = throttled({ 'retry-after': 'Sat, 21 Nov 2026 12:00:05 GMT' });
      expect(getRetryAfterMs(error, now)).toBe(5000);
    });

    it('returns undefined when the hint is missing or invalid', () => {
      expect(getRetryAfterMs(throttled())).toBeUndefined();
      expect(getRetryAfterMs(throttled({ 'retry-after': 'soon' }))).toBeUndefined();
    });
  });

  describe('planRateLimitRetry', () => {
    it('honors a Retry-After hint within the delay cap', () => {
      expect(planRateLimitRetry(throttled({ 'retry-after': '1' }), 0, policy)).toEqual({
        retry: true,
        delayMs: 1000,
      });
    });

    it('uses capped exponential backoff without a hint', () => {
      expect(planRateLimitRetry(throttled(), 0, policy)).toEqual({ retry: true, delayMs: 100 });
      expect(planRateLimitRetry(throttled(), 2, policy)).toEqual({ retry: true, delayMs: 400 });
      expect(
        planRateLimitRetry(throttled(), 2, { ...policy, maxDelayMs: 250 }),
      ).toEqual({ retry: true, delayMs: 250 });
    });

    it('fails fast when the hint exceeds the delay cap, passing the hint on', () => {
      expect(planRateLimitRetry(throttled({ 'retry-after': '120' }), 0, policy)).toEqual({
        retry: false,
        retryAfterSeconds: 120,
      });
    });

    it('stops after the attempt cap', () => {
      expect(planRateLimitRetry(throttled(), 3, policy)).toEqual({
        retry: false,
        retryAfterSeconds: 1,
      });
    });
  });

  describe('backOffOrFail', () => {
    it('sleeps for the planned delay', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const logger = { warn: jest.fn() };
      await backOffOrFail('op', throttled({ 'retry-after': '1' }), 0, rpcConfig, logger, sleep);
      expect(sleep).toHaveBeenCalledWith(1000);
    });

    it('throws a safe 503 with Retry-After when it must give up', async () => {
      const logger = { warn: jest.fn() };
      const error = Object.assign(throttled({ 'retry-after': '90' }), {
        config: { headers: { Authorization: 'Bearer provider-api-key' } },
      });

      const attempt = backOffOrFail('op', error, 0, rpcConfig, logger, jest.fn());

      await expect(attempt).rejects.toBeInstanceOf(StellarRpcUnavailableException);
      const thrown = await attempt.catch((e) => e);
      expect(thrown.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(thrown.getResponse()).toMatchObject({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        retryAfter: 90,
      });
      expect(JSON.stringify(thrown.getResponse())).not.toContain('provider-api-key');
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('provider-api-key');
    });
  });

  it('handleStellarError keeps the 503 instead of rewrapping it', () => {
    const unavailable = new StellarRpcUnavailableException(5);
    expect(handleStellarError(unavailable)).toBe(unavailable);
  });

  // ── Rate-limit scenarios through the real services ───────────────────────

  describe('service scenarios', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    const makeStellarService = (server: Record<string, unknown> = {}) => {
      const stellarConfig = {
        getConfig: () => rpcConfig,
        getServer: () => server,
      };
      const configService = { get: (_key: string, fallback?: unknown) => fallback };
      return new StellarService(
        configService as any,
        stellarConfig as any,
        {} as any,
        {} as any,
        {} as any,
      );
    };

    const TX_HASH = 'a'.repeat(64);

    it('verifyTransaction: retries after the Retry-After hint and then succeeds', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response('', { status: 429, headers: { 'Retry-After': '1' } }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ successful: true }), { status: 200 }));
      const service = makeStellarService();

      const result = service.verifyTransaction(TX_HASH);
      await jest.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);

      await expect(result).resolves.toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('verifyTransaction: a sustained 429 is capped and surfaces 503, not "invalid tx"', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async () => new Response('', { status: 429 }));
      const service = makeStellarService();

      const result = service.verifyTransaction(TX_HASH).catch((e) => e);
      await jest.advanceTimersByTimeAsync(10_000);

      const error = await result;
      expect(error).toBeInstanceOf(StellarRpcUnavailableException);
      expect(fetchMock).toHaveBeenCalledTimes(rpcConfig.rpcMaxRetries + 1);
    });

    it('verifyTransaction: a long Retry-After fails fast without retrying', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockImplementation(
          async () => new Response('', { status: 429, headers: { 'Retry-After': '300' } }),
        );
      const service = makeStellarService();

      const error = await service.verifyTransaction(TX_HASH).catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(error.getResponse()).toMatchObject({ retryAfter: 300 });
    });

    it('getAccountBalance: throttling is retried, not reported as "account not found"', async () => {
      const loadAccount = jest
        .fn()
        .mockRejectedValueOnce(throttled())
        .mockResolvedValueOnce({ balances: [{ asset_type: 'native', balance: '10' }] });
      const service = makeStellarService({ loadAccount });

      const result = service.getAccountBalance('GABC');
      await jest.advanceTimersByTimeAsync(rpcConfig.rpcRetryBaseDelayMs);

      await expect(result).resolves.toEqual({ native: '10', assets: [] });
      expect(loadAccount).toHaveBeenCalledTimes(2);
    });

    it('verifyTransactionFull: sustained throttling surfaces 503', async () => {
      const call = jest.fn().mockRejectedValue(throttled());
      const service = makeStellarService({
        transactions: () => ({ transaction: () => ({ call }) }),
      });

      const result = service.verifyTransactionFull(TX_HASH).catch((e) => e);
      await jest.advanceTimersByTimeAsync(10_000);

      expect(await result).toBeInstanceOf(StellarRpcUnavailableException);
      expect(call).toHaveBeenCalledTimes(rpcConfig.rpcMaxRetries + 1);
    });

    it('submitTransaction: honors Retry-After before resubmitting', async () => {
      const submitTransaction = jest
        .fn()
        .mockRejectedValueOnce(throttled({ 'retry-after': '2' }))
        .mockResolvedValueOnce({ hash: 'h1' });
      const builder = new TransactionBuilderService({
        getConfig: () => rpcConfig,
        getServer: () => ({ submitTransaction }),
      } as any);

      const result = builder.submitTransaction({});
      await jest.advanceTimersByTimeAsync(1999);
      expect(submitTransaction).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);

      await expect(result).resolves.toEqual({ hash: 'h1' });
    });

    it('verifyConfession: sustained throttling surfaces 503, not "not anchored"', async () => {
      const service = new ContractService(
        {
          getConfig: () => rpcConfig,
          getContractId: () => 'CB5XMDHT66EISB4WXM4YGNDHYRMZDX42TOHZEAENIUTSSMRFHJSFRNHB',
        } as any,
        {} as any,
      );
      mockContractCall.mockReset().mockRejectedValue(throttled());

      const result = service.verifyConfession('ab'.repeat(32)).catch((e) => e);
      await jest.advanceTimersByTimeAsync(10_000);

      expect(await result).toBeInstanceOf(StellarRpcUnavailableException);
      expect(mockContractCall).toHaveBeenCalledTimes(rpcConfig.rpcMaxRetries + 1);
    });
  });

  it('rateLimitErrorFromResponse carries status and headers for planning', () => {
    const error = rateLimitErrorFromResponse({
      status: 429,
      headers: new Headers({ 'retry-after': '4' }),
    });
    expect(isRateLimitError(error)).toBe(true);
    expect(getRetryAfterMs(error)).toBe(4000);
  });
});
