/**
 * Tip amount validation boundary value tests
 * 
 * Covers:
 *   - Supported asset validation (XLM native only)
 *   - Decimal precision validation (max 7 decimals for XLM)
 *   - Amount bounds validation (zero, negative, min, max)
 *   - Unsupported asset rejection
 */
import {
  BadRequestException,
} from '@nestjs/common';
import {
  validateTipAsset,
  validateTipPrecision,
  validateTipAmountBounds,
  SUPPORTED_TIP_ASSETS,
  DEFAULT_TIP_ASSET,
  MIN_TIP_AMOUNT,
  MAX_TIP_AMOUNT,
  TIP_PRECISION,
} from './tipping.constants';

describe('Tip Validation — boundary values', () => {
  describe('validateTipAsset', () => {
    it('accepts native XLM asset', () => {
      const result = validateTipAsset('XLM', null, 'native');
      expect(result).toEqual(DEFAULT_TIP_ASSET);
    });

    it('accepts XLM with case insensitivity', () => {
      const result = validateTipAsset('xlm', null, 'native');
      expect(result.code).toBe('XLM');
    });

    it('rejects unsupported asset code', () => {
      expect(() => validateTipAsset('USDC', 'GBBD...', 'credit_alphanum4'))
        .toThrow(BadRequestException);
    });

    it('rejects XLM with issuer (native must have null issuer)', () => {
      expect(() => validateTipAsset('XLM', 'GSOMEISSUER', 'native'))
        .toThrow(BadRequestException);
    });

    it('rejects native asset with non-native type', () => {
      expect(() => validateTipAsset('XLM', null, 'credit_alphanum4'))
        .toThrow(BadRequestException);
    });

    it('rejects unknown asset type', () => {
      expect(() => validateTipAsset('XLM', null, 'unknown'))
        .toThrow(BadRequestException);
    });

    it('includes supported assets in error message', () => {
      try {
        validateTipAsset('DOGE', null, 'native');
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toContain('XLM');
      }
    });
  });

  describe('validateTipPrecision', () => {
    it('accepts exactly 7 decimal places (max for XLM)', () => {
      expect(() => validateTipPrecision(1.1234567, 7)).not.toThrow();
    });

    it('accepts fewer than 7 decimal places', () => {
      expect(() => validateTipPrecision(1.1, 7)).not.toThrow();
      expect(() => validateTipPrecision(1.12, 7)).not.toThrow();
      expect(() => validateTipPrecision(1.123456, 7)).not.toThrow();
    });

    it('accepts whole numbers (no decimal places)', () => {
      expect(() => validateTipPrecision(100, 7)).not.toThrow();
      expect(() => validateTipPrecision(1, 7)).not.toThrow();
    });

    it('rejects 8 decimal places (exceeds XLM precision)', () => {
      expect(() => validateTipPrecision(1.12345678, 7))
        .toThrow(BadRequestException);
    });

    it('rejects 10 decimal places', () => {
      expect(() => validateTipPrecision(1.1234567890, 7))
        .toThrow(BadRequestException);
    });

    it('rejects excessive precision with descriptive error', () => {
      try {
        validateTipPrecision(0.123456789, 7);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toContain('8 decimal places');
        expect((e as BadRequestException).message).toContain('maximum allowed is 7');
      }
    });
  });

  describe('validateTipAmountBounds', () => {
    it('accepts minimum amount (0.1 XLM)', () => {
      expect(() => validateTipAmountBounds(0.1)).not.toThrow();
    });

    it('accepts amount above minimum', () => {
      expect(() => validateTipAmountBounds(0.11)).not.toThrow();
      expect(() => validateTipAmountBounds(1)).not.toThrow();
      expect(() => validateTipAmountBounds(100)).not.toThrow();
    });

    it('accepts maximum amount (10,000 XLM)', () => {
      expect(() => validateTipAmountBounds(10000)).not.toThrow();
    });

    it('rejects zero amount', () => {
      expect(() => validateTipAmountBounds(0))
        .toThrow(BadRequestException);
    });

    it('rejects negative amount', () => {
      expect(() => validateTipAmountBounds(-1))
        .toThrow(BadRequestException);
      expect(() => validateTipAmountBounds(-0.1))
        .toThrow(BadRequestException);
      expect(() => validateTipAmountBounds(-100))
        .toThrow(BadRequestException);
    });

    it('rejects amount below minimum', () => {
      expect(() => validateTipAmountBounds(0.09))
        .toThrow(BadRequestException);
      expect(() => validateTipAmountBounds(0.01))
        .toThrow(BadRequestException);
    });

    it('rejects amount above maximum', () => {
      expect(() => validateTipAmountBounds(10000.01))
        .toThrow(BadRequestException);
      expect(() => validateTipAmountBounds(10001))
        .toThrow(BadRequestException);
      expect(() => validateTipAmountBounds(100000))
        .toThrow(BadRequestException);
    });

    it('rejects below minimum with descriptive error', () => {
      try {
        validateTipAmountBounds(0.05);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toContain('below minimum');
        expect((e as BadRequestException).message).toContain('0.1');
      }
    });

    it('rejects above maximum with descriptive error', () => {
      try {
        validateTipAmountBounds(15000);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toContain('exceeds maximum');
        expect((e as BadRequestException).message).toContain('10000');
      }
    });

    it('rejects zero with descriptive error', () => {
      try {
        validateTipAmountBounds(0);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toContain('positive');
      }
    });
  });

  describe('Constants', () => {
    it('has correct MIN_TIP_AMOUNT', () => {
      expect(MIN_TIP_AMOUNT).toBe(0.1);
    });

    it('has correct MAX_TIP_AMOUNT', () => {
      expect(MAX_TIP_AMOUNT).toBe(10000);
    });

    it('has correct TIP_PRECISION for XLM', () => {
      expect(TIP_PRECISION).toBe(7);
    });

    it('has XLM as only supported asset', () => {
      expect(SUPPORTED_TIP_ASSETS).toHaveLength(1);
      expect(SUPPORTED_TIP_ASSETS[0].code).toBe('XLM');
      expect(SUPPORTED_TIP_ASSETS[0].issuer).toBeNull();
      expect(SUPPORTED_TIP_ASSETS[0].assetType).toBe('native');
      expect(SUPPORTED_TIP_ASSETS[0].precision).toBe(7);
    });

    it('DEFAULT_TIP_ASSET matches XLM', () => {
      expect(DEFAULT_TIP_ASSET).toEqual(SUPPORTED_TIP_ASSETS[0]);
    });
  });
});