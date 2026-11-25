import { describe, expect, it } from '@jest/globals';
import {
  CORRELATION_ID_FIELD,
  correlationLogTag,
  readCorrelationId,
  resolveCorrelationId,
  withCorrelationId,
} from './correlation-id';

/**
 * Issue #2126: the shared correlation-id helper the BullMQ queues use.
 *
 * The tests pin down:
 *   - a provided upstream id is preserved verbatim;
 *   - a missing or blank upstream id gets a fresh UUID so a worker
 *     always has an id to log;
 *   - once stamped, the id survives retries (the helper is a no-op on
 *     a payload that already carries one);
 *   - the log tag is empty for a payload without an id, so logger
 *     concatenation never produces `correlationId=undefined`;
 *   - the field stays `correlationId`, since every queue consumer and
 *     downstream log aggregator reads that key.
 */

describe('correlation-id helper (#2126)', () => {
  describe('resolveCorrelationId', () => {
    it('keeps a well-formed upstream id', () => {
      expect(resolveCorrelationId('req-abc-123')).toBe('req-abc-123');
    });

    it('trims surrounding whitespace rather than preserving it in logs', () => {
      expect(resolveCorrelationId('  req-abc  ')).toBe('req-abc');
    });

    it('mints a UUID when no upstream id is supplied', () => {
      const id = resolveCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('mints a UUID when the upstream id is an empty or whitespace-only string', () => {
      expect(resolveCorrelationId('')).toMatch(/^[0-9a-f-]+$/);
      expect(resolveCorrelationId('   ')).toMatch(/^[0-9a-f-]+$/);
    });

    it('mints a UUID when the upstream id is null', () => {
      expect(resolveCorrelationId(null)).toMatch(/^[0-9a-f-]+$/);
    });
  });

  describe('withCorrelationId', () => {
    it('stamps a payload that has no correlation id', () => {
      const stamped = withCorrelationId({ userId: 'u1' }, 'req-xyz');
      expect(stamped.correlationId).toBe('req-xyz');
      expect(stamped.userId).toBe('u1');
    });

    it('preserves an existing correlation id across retries', () => {
      const stamped = withCorrelationId(
        { userId: 'u1', correlationId: 'original-id' },
        'should-be-ignored',
      );
      expect(stamped.correlationId).toBe('original-id');
    });

    it('stamps a fresh UUID when no upstream id is passed and payload has none', () => {
      const stamped = withCorrelationId({ userId: 'u1' });
      expect(stamped.correlationId).toMatch(/^[0-9a-f-]+$/);
    });

    it('uses the documented field name so consumers can read without configuration', () => {
      expect(CORRELATION_ID_FIELD).toBe('correlationId');
    });
  });

  describe('readCorrelationId', () => {
    it('returns the id when present', () => {
      expect(readCorrelationId({ correlationId: 'abc' })).toBe('abc');
    });

    it('returns undefined when the field is missing', () => {
      expect(readCorrelationId({ userId: 'u1' })).toBeUndefined();
    });

    it('returns undefined for a non-object', () => {
      expect(readCorrelationId(null)).toBeUndefined();
      expect(readCorrelationId('not an object')).toBeUndefined();
      expect(readCorrelationId(undefined)).toBeUndefined();
    });

    it('returns undefined for an empty correlation id', () => {
      expect(readCorrelationId({ correlationId: '' })).toBeUndefined();
    });
  });

  describe('correlationLogTag', () => {
    it('formats the id with a leading space so loggers can concatenate', () => {
      expect(correlationLogTag({ correlationId: 'abc' })).toBe(' correlationId=abc');
    });

    it('is empty when no id is present, so concatenation does not produce `correlationId=undefined`', () => {
      expect(correlationLogTag({ userId: 'u1' })).toBe('');
      expect(correlationLogTag(null)).toBe('');
    });
  });
});
