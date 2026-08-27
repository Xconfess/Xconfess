import {
  StellarTimeoutError,
  StellarInvalidSignatureError,
  StellarMalformedTransactionError,
  StellarNetworkError,
  StellarContractError,
  handleStellarError,
  handleStellarContractError,
  getClientSafeContractErrorMessage,
  ContractErrorResponse,
} from '../stellar-error.handler';
import {
  ANCHOR_ERROR_CODES,
  TIPPING_ERROR_CODES,
  ContractErrorClassification,
} from '../stellar-contract-errors';

describe('StellarErrorHandler', () => {
  describe('Transaction Error Classes', () => {
    it('should create StellarTimeoutError with correct name', () => {
      const err = new StellarTimeoutError('Request timed out');
      expect(err.name).toBe('StellarTimeoutError');
      expect(err.message).toBe('Request timed out');
    });

    it('should create StellarInvalidSignatureError with correct name', () => {
      const err = new StellarInvalidSignatureError('Bad auth');
      expect(err.name).toBe('StellarInvalidSignatureError');
      expect(err.message).toBe('Bad auth');
    });

    it('should create StellarMalformedTransactionError with correct name', () => {
      const err = new StellarMalformedTransactionError('Malformed tx');
      expect(err.name).toBe('StellarMalformedTransactionError');
      expect(err.message).toBe('Malformed tx');
    });

    it('should create StellarNetworkError with correct name', () => {
      const err = new StellarNetworkError('Network error');
      expect(err.name).toBe('StellarNetworkError');
      expect(err.message).toBe('Network error');
    });
  });

  describe('StellarContractError', () => {
    it('should create error with correct classification and http status', () => {
      const err = handleStellarContractError(ANCHOR_ERROR_CODES.UNAUTHORIZED);
      expect(err).toBeInstanceOf(StellarContractError);
      expect(err.name).toBe('StellarContractError');
      expect(err.code).toBe(ANCHOR_ERROR_CODES.UNAUTHORIZED);
      expect(err.classification).toBe(ContractErrorClassification.TERMINAL);
      expect(err.httpStatus).toBe(403);
      expect(err.retryable).toBe(false);
    });

    it('should mark retryable errors correctly', () => {
      const err = handleStellarContractError(ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE);
      expect(err.retryable).toBe(true);
      expect(err.httpStatus).toBe(503);
    });

    it('should mark unknown errors as terminal', () => {
      const err = handleStellarContractError(99999);
      expect(err.classification).toBe(ContractErrorClassification.UNKNOWN);
      expect(err.retryable).toBe(false);
      expect(err.httpStatus).toBe(400);
    });

    it('should produce structured response', () => {
      const err = handleStellarContractError(TIPPING_ERROR_CODES.RATE_LIMITED);
      const response: ContractErrorResponse = err.toResponse();
      expect(response.code).toBe(TIPPING_ERROR_CODES.RATE_LIMITED);
      expect(response.classification).toBe(ContractErrorClassification.RETRYABLE);
      expect(response.retryable).toBe(true);
      expect(response.httpStatus).toBe(503);
      expect(response.message).toBeTruthy();
    });
  });

  describe('getClientSafeContractErrorMessage', () => {
    it('should return client-safe message for known anchor errors', () => {
      const msg = getClientSafeContractErrorMessage(ANCHOR_ERROR_CODES.UNAUTHORIZED);
      expect(msg).toContain('not authorized');
      expect(msg).not.toContain('UNAUTHORIZED');
    });

    it('should return client-safe message for known tipping errors', () => {
      const msg = getClientSafeContractErrorMessage(TIPPING_ERROR_CODES.CONTRACT_PAUSED);
      expect(msg).toContain('temporarily paused');
    });

    it('should return fallback for unknown error codes', () => {
      const msg = getClientSafeContractErrorMessage(99999);
      expect(msg).toContain('99999');
    });

    it('should provide distinct messages for different error codes', () => {
      const msg1 = getClientSafeContractErrorMessage(ANCHOR_ERROR_CODES.CONFESSION_EXISTS);
      const msg2 = getClientSafeContractErrorMessage(ANCHOR_ERROR_CODES.CONFESSION_EMPTY);
      expect(msg1).not.toBe(msg2);
    });
  });

  describe('handleStellarContractError — Anchor error mapping', () => {
    it('should map all anchor terminal errors correctly', () => {
      const terminalCodes = [
        ANCHOR_ERROR_CODES.UNAUTHORIZED,
        ANCHOR_ERROR_CODES.NOT_FOUND,
        ANCHOR_ERROR_CODES.INVALID_INPUT,
        ANCHOR_ERROR_CODES.PAYLOAD_TOO_LARGE,
        ANCHOR_ERROR_CODES.METADATA_TOO_LONG,
        ANCHOR_ERROR_CODES.CONFESSION_EXISTS,
        ANCHOR_ERROR_CODES.CONFESSION_EMPTY,
        ANCHOR_ERROR_CODES.CONFESSION_TOO_LONG,
        ANCHOR_ERROR_CODES.REACTION_EXISTS,
        ANCHOR_ERROR_CODES.INVALID_REACTION_TYPE,
        ANCHOR_ERROR_CODES.REPORT_EXISTS,
        ANCHOR_ERROR_CODES.INVALID_REPORT_REASON,
        ANCHOR_ERROR_CODES.REPORT_REASON_TOO_LONG,
        ANCHOR_ERROR_CODES.PROPOSAL_NOT_FOUND,
        ANCHOR_ERROR_CODES.UNAUTHORIZED_APPROVAL,
        ANCHOR_ERROR_CODES.QUORUM_NOT_REACHED,
        ANCHOR_ERROR_CODES.ALREADY_APPROVED,
        ANCHOR_ERROR_CODES.ALREADY_EXECUTED,
        ANCHOR_ERROR_CODES.INVALID_ACTION,
      ];

      for (const code of terminalCodes) {
        const err = handleStellarContractError(code);
        expect(err.classification).toBe(ContractErrorClassification.TERMINAL);
        expect(err.retryable).toBe(false);
        expect(err.httpStatus).not.toBe(503);
      }
    });

    it('should map anchor retryable errors correctly', () => {
      const retryableCodes = [
        ANCHOR_ERROR_CODES.OVERFLOW,
        ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE,
      ];

      for (const code of retryableCodes) {
        const err = handleStellarContractError(code);
        expect(err.classification).toBe(ContractErrorClassification.RETRYABLE);
        expect(err.retryable).toBe(true);
        expect(err.httpStatus).toBe(503);
      }
    });
  });

  describe('handleStellarContractError — Tipping error mapping', () => {
    it('should map all tipping terminal errors correctly', () => {
      const terminalCodes = [
        TIPPING_ERROR_CODES.INVALID_TIP_AMOUNT,
        TIPPING_ERROR_CODES.METADATA_TOO_LONG,
        TIPPING_ERROR_CODES.UNAUTHORIZED,
        TIPPING_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG,
      ];

      for (const code of terminalCodes) {
        const err = handleStellarContractError(code);
        expect(err.classification).toBe(ContractErrorClassification.TERMINAL);
        expect(err.retryable).toBe(false);
        expect(err.httpStatus).not.toBe(503);
      }
    });

    it('should map tipping retryable errors correctly', () => {
      const retryableCodes = [
        TIPPING_ERROR_CODES.TOTAL_OVERFLOW,
        TIPPING_ERROR_CODES.NONCE_OVERFLOW,
        TIPPING_ERROR_CODES.CONTRACT_PAUSED,
        TIPPING_ERROR_CODES.RATE_LIMITED,
      ];

      for (const code of retryableCodes) {
        const err = handleStellarContractError(code);
        expect(err.classification).toBe(ContractErrorClassification.RETRYABLE);
        expect(err.retryable).toBe(true);
        expect(err.httpStatus).toBe(503);
      }
    });

    it('should provide meaningful client-safe messages for tipping errors', () => {
      const messages = [
        { code: TIPPING_ERROR_CODES.INVALID_TIP_AMOUNT, contains: 'amount' },
        { code: TIPPING_ERROR_CODES.CONTRACT_PAUSED, contains: 'paused' },
        { code: TIPPING_ERROR_CODES.RATE_LIMITED, contains: 'quickly' },
        { code: TIPPING_ERROR_CODES.TOTAL_OVERFLOW, contains: 'exceeded' },
        { code: TIPPING_ERROR_CODES.UNAUTHORIZED, contains: 'authorized' },
      ];

      for (const { code, contains } of messages) {
        const err = handleStellarContractError(code);
        expect(err.message.toLowerCase()).toContain(contains);
      }
    });
  });

  describe('handleStellarError', () => {
    it('should handle timeout errors', () => {
      const result = handleStellarError(new Error('request timeout'));
      expect(result).toBeInstanceOf(StellarTimeoutError);
    });

    it('should handle signature errors', () => {
      const result = handleStellarError(new Error('bad_auth signature'));
      expect(result).toBeInstanceOf(StellarInvalidSignatureError);
    });

    it('should handle malformed transaction errors', () => {
      const result = handleStellarError(new Error('tx_bad_seq malformed'));
      expect(result).toBeInstanceOf(StellarMalformedTransactionError);
    });

    it('should handle horizon result codes', () => {
      const horizonError = {
        response: {
          data: {
            extras: {
              result_codes: {
                transaction: 'tx_bad_auth',
              },
            },
          },
        },
      };
      const result = handleStellarError(horizonError);
      expect(result).toBeInstanceOf(StellarInvalidSignatureError);
    });

    it('should fall back to StellarNetworkError for unknown errors', () => {
      const result = handleStellarError(new Error('something unexpected'));
      expect(result).toBeInstanceOf(StellarNetworkError);
    });
  });
});
