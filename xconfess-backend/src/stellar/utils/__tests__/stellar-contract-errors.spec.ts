import {
  ANCHOR_ERROR_CODES,
  TIPPING_ERROR_CODES,
  CONTRACT_ERROR_CODES,
  ContractErrorClassification,
  classifyContractError,
  isRetryableContractError,
  getContractErrorMessage,
  getHttpStatusForContractError,
  getRetryDelayMs,
} from '../stellar-contract-errors';

describe('ContractErrorCodes', () => {
  describe('Code Constants', () => {
    it('should have unique anchor error codes', () => {
      const codes = Object.values(ANCHOR_ERROR_CODES);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should have unique tipping error codes', () => {
      const codes = Object.values(TIPPING_ERROR_CODES);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should have no overlap between anchor and tipping codes', () => {
      const anchorCodes = new Set(Object.values(ANCHOR_ERROR_CODES));
      const tipCodes = Object.values(TIPPING_ERROR_CODES);
      for (const code of tipCodes) {
        expect(anchorCodes.has(code)).toBe(false);
      }
    });

    it('should organize error codes in correct ranges', () => {
      // Global: 1000-1099
      expect(ANCHOR_ERROR_CODES.UNAUTHORIZED).toBeGreaterThanOrEqual(1000);
      expect(ANCHOR_ERROR_CODES.METADATA_TOO_LONG).toBeLessThan(1100);

      // Confession: 2000-2099
      expect(ANCHOR_ERROR_CODES.CONFESSION_EXISTS).toBeGreaterThanOrEqual(2000);
      expect(ANCHOR_ERROR_CODES.CONFESSION_TOO_LONG).toBeLessThan(2100);

      // Tipping: 6000-6099
      expect(TIPPING_ERROR_CODES.INVALID_TIP_AMOUNT).toBeGreaterThanOrEqual(6000);
      expect(TIPPING_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG).toBeLessThan(6100);
    });

    it('should export unified error code registry', () => {
      expect(CONTRACT_ERROR_CODES).toHaveProperty('UNAUTHORIZED');
      expect(CONTRACT_ERROR_CODES).toHaveProperty('INVALID_TIP_AMOUNT');
      expect(CONTRACT_ERROR_CODES.UNAUTHORIZED).toBe(1000);
      expect(CONTRACT_ERROR_CODES.INVALID_TIP_AMOUNT).toBe(6001);
    });
  });

  describe('classifyContractError', () => {
    it('should classify terminal errors correctly', () => {
      const terminalCodes = [
        ANCHOR_ERROR_CODES.UNAUTHORIZED,
        ANCHOR_ERROR_CODES.INVALID_INPUT,
        ANCHOR_ERROR_CODES.INVALID_REACTION_TYPE,
        TIPPING_ERROR_CODES.INVALID_TIP_AMOUNT,
        TIPPING_ERROR_CODES.UNAUTHORIZED,
      ];

      for (const code of terminalCodes) {
        expect(classifyContractError(code)).toBe(
          ContractErrorClassification.TERMINAL,
        );
      }
    });

    it('should classify retryable errors correctly', () => {
      const retryableCodes = [
        ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE,
        ANCHOR_ERROR_CODES.OVERFLOW,
        TIPPING_ERROR_CODES.CONTRACT_PAUSED,
        TIPPING_ERROR_CODES.RATE_LIMITED,
        TIPPING_ERROR_CODES.TOTAL_OVERFLOW,
      ];

      for (const code of retryableCodes) {
        expect(classifyContractError(code)).toBe(
          ContractErrorClassification.RETRYABLE,
        );
      }
    });

    it('should return Unknown for unrecognized error codes', () => {
      expect(classifyContractError(99999)).toBe(
        ContractErrorClassification.UNKNOWN,
      );
      expect(classifyContractError(-1)).toBe(
        ContractErrorClassification.UNKNOWN,
      );
    });
  });

  describe('isRetryableContractError', () => {
    it('should return true for retryable errors', () => {
      expect(isRetryableContractError(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE)).toBe(
        true,
      );
      expect(isRetryableContractError(TIPPING_ERROR_CODES.RATE_LIMITED)).toBe(
        true,
      );
    });

    it('should return false for terminal errors', () => {
      expect(isRetryableContractError(ANCHOR_ERROR_CODES.UNAUTHORIZED)).toBe(
        false,
      );
      expect(isRetryableContractError(TIPPING_ERROR_CODES.INVALID_TIP_AMOUNT)).toBe(
        false,
      );
    });

    it('should return false for unknown errors', () => {
      expect(isRetryableContractError(99999)).toBe(false);
    });
  });

  describe('getContractErrorMessage', () => {
    it('should convert error codes to human-readable messages', () => {
      expect(getContractErrorMessage(ANCHOR_ERROR_CODES.UNAUTHORIZED)).toBe(
        'Unauthorized',
      );
      expect(getContractErrorMessage(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE)).toBe(
        'Cooldown Active',
      );
      expect(
        getContractErrorMessage(ANCHOR_ERROR_CODES.INVALID_REACTION_TYPE),
      ).toBe('Invalid Reaction Type');
      expect(getContractErrorMessage(TIPPING_ERROR_CODES.RATE_LIMITED)).toBe(
        'Rate Limited',
      );
    });

    it('should handle unknown error codes gracefully', () => {
      const message = getContractErrorMessage(99999);
      expect(message).toContain('Unknown contract error');
      expect(message).toContain('99999');
    });
  });

  describe('getHttpStatusForContractError', () => {
    it('should return 503 for retryable errors', () => {
      expect(
        getHttpStatusForContractError(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE),
      ).toBe(503);
      expect(
        getHttpStatusForContractError(TIPPING_ERROR_CODES.RATE_LIMITED),
      ).toBe(503);
      expect(getHttpStatusForContractError(ANCHOR_ERROR_CODES.OVERFLOW)).toBe(
        503,
      );
    });

    it('should return 403 for unauthorized errors', () => {
      expect(getHttpStatusForContractError(ANCHOR_ERROR_CODES.UNAUTHORIZED)).toBe(
        403,
      );
      expect(getHttpStatusForContractError(TIPPING_ERROR_CODES.UNAUTHORIZED)).toBe(
        403,
      );
    });

    it('should return 404 for not found errors', () => {
      expect(getHttpStatusForContractError(ANCHOR_ERROR_CODES.NOT_FOUND)).toBe(
        404,
      );
      expect(
        getHttpStatusForContractError(ANCHOR_ERROR_CODES.PROPOSAL_NOT_FOUND),
      ).toBe(404);
    });

    it('should return 409 for conflict errors', () => {
      expect(
        getHttpStatusForContractError(ANCHOR_ERROR_CODES.CONFESSION_EXISTS),
      ).toBe(409);
      expect(
        getHttpStatusForContractError(ANCHOR_ERROR_CODES.REACTION_EXISTS),
      ).toBe(409);
      expect(getHttpStatusForContractError(ANCHOR_ERROR_CODES.REPORT_EXISTS)).toBe(
        409,
      );
    });

    it('should return 400 for other terminal errors', () => {
      expect(getHttpStatusForContractError(ANCHOR_ERROR_CODES.INVALID_INPUT)).toBe(
        400,
      );
      expect(getHttpStatusForContractError(ANCHOR_ERROR_CODES.PAYLOAD_TOO_LARGE)).toBe(
        400,
      );
      expect(
        getHttpStatusForContractError(TIPPING_ERROR_CODES.INVALID_TIP_AMOUNT),
      ).toBe(400);
    });

    it('should return 400 for unknown error codes', () => {
      expect(getHttpStatusForContractError(99999)).toBe(400);
    });
  });

  describe('getRetryDelayMs', () => {
    it('should return null for terminal errors', () => {
      expect(getRetryDelayMs(ANCHOR_ERROR_CODES.UNAUTHORIZED)).toBeNull();
      expect(getRetryDelayMs(TIPPING_ERROR_CODES.INVALID_TIP_AMOUNT)).toBeNull();
    });

    it('should return delay for retryable errors', () => {
      const delay = getRetryDelayMs(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE, 0);
      expect(delay).not.toBeNull();
      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThan(200);
    });

    it('should implement exponential backoff', () => {
      const delay0 = getRetryDelayMs(ANCHOR_ERROR_CODES.OVERFLOW, 0);
      const delay1 = getRetryDelayMs(ANCHOR_ERROR_CODES.OVERFLOW, 1);
      const delay2 = getRetryDelayMs(ANCHOR_ERROR_CODES.OVERFLOW, 2);

      expect(delay0).not.toBeNull();
      expect(delay1).not.toBeNull();
      expect(delay2).not.toBeNull();

      // Each should be roughly 2x the previous (accounting for jitter)
      expect(delay1! > delay0!).toBe(true);
      expect(delay2! > delay1!).toBe(true);
    });

    it('should add jitter to prevent thundering herd', () => {
      const delays = [
        getRetryDelayMs(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE, 0),
        getRetryDelayMs(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE, 0),
        getRetryDelayMs(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE, 0),
      ];

      // With jitter, delays should not all be identical
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('Backend Integration Patterns', () => {
    it('should support retry logic with backoff', async () => {
      let attempts = 0;
      const maxAttempts = 3;

      async function invokeWithRetry(
        errorCode: number,
      ): Promise<string> {
        while (attempts < maxAttempts) {
          attempts++;

          if (isRetryableContractError(errorCode)) {
            const delay = getRetryDelayMs(errorCode, attempts - 1);
            if (delay !== null) {
              continue;
            }
          }

          return `Failed with error ${errorCode}`;
        }
        return 'Max attempts reached';
      }

      // Retryable error should try multiple times
      await invokeWithRetry(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE);
      expect(attempts).toBeGreaterThan(1);
    });

    it('should support circuit breaker pattern', () => {
      const circuitBreaker = {
        failures: 0,
        threshold: 5,
        isOpen: false,
        recordFailure: function (errorCode: number) {
          if (isRetryableContractError(errorCode)) {
            this.failures++;
            if (this.failures >= this.threshold) {
              this.isOpen = true;
            }
          } else {
            // Terminal errors count as immediate failure
            this.isOpen = true;
          }
        },
      };

      // Record several retryable failures
      for (let i = 0; i < 4; i++) {
        circuitBreaker.recordFailure(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE);
      }
      expect(circuitBreaker.isOpen).toBe(false);

      // One more retryable pushes over threshold
      circuitBreaker.recordFailure(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE);
      expect(circuitBreaker.isOpen).toBe(true);

      // Single terminal error opens immediately
      circuitBreaker.failures = 0;
      circuitBreaker.isOpen = false;
      circuitBreaker.recordFailure(ANCHOR_ERROR_CODES.UNAUTHORIZED);
      expect(circuitBreaker.isOpen).toBe(true);
    });

    it('should support API response generation', () => {
      function buildErrorResponse(errorCode: number) {
        return {
          statusCode: getHttpStatusForContractError(errorCode),
          error: getContractErrorMessage(errorCode),
          retryable: isRetryableContractError(errorCode),
          code: errorCode,
        };
      }

      const retryableResponse = buildErrorResponse(
        ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE,
      );
      expect(retryableResponse.statusCode).toBe(503);
      expect(retryableResponse.retryable).toBe(true);

      const terminalResponse = buildErrorResponse(ANCHOR_ERROR_CODES.UNAUTHORIZED);
      expect(terminalResponse.statusCode).toBe(403);
      expect(terminalResponse.retryable).toBe(false);
    });
  });
});
