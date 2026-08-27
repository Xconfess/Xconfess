import {
  GOVERNANCE_STREAM_TOPIC,
  getCompatibilityMatrix,
  parseContractEvent,
  parseGovernanceStreamEvent,
} from './contract-event-parser';
import { ContractEventParseError, EventParseErrorCode } from './contract-event-parser.types';
import { CONTRACT_EVENT_FIXTURES } from './contract-event-fixtures';

describe('parseContractEvent — fixture coverage', () => {
  it.each(CONTRACT_EVENT_FIXTURES.map((f) => [f.eventName, f.topic, f]))(
    'parses %s on topic "%s"',
    (_name, _topic, fixture) => {
      const parsed =
        fixture.topic === GOVERNANCE_STREAM_TOPIC
          ? parseGovernanceStreamEvent(fixture.eventVersion, fixture.values)
          : parseContractEvent(fixture);

      expect(parsed.eventName).toBe(fixture.eventName);
      expect(parsed.category).toBe(fixture.category);
      expect(parsed.eventVersion).toBe(fixture.eventVersion);
      expect(Object.keys(parsed.fields)).toHaveLength(fixture.values.length);
    },
  );

  it('every documented category from the ABI reference has at least one fixture', () => {
    const categories = new Set(CONTRACT_EVENT_FIXTURES.map((f) => f.category));
    const expected = [
      'anchor',
      'confession',
      'governance',
      'pause',
      'reaction',
      'report',
      'reputation',
      'role',
      'tip',
    ];
    expect([...categories].sort()).toEqual(expected.sort());
  });

  it('disambiguates two distinct event shapes sharing the "report" topic by field count', () => {
    const reportEvent = CONTRACT_EVENT_FIXTURES.find((f) => f.eventName === 'ReportEvent')!;
    const ledgerEvent = CONTRACT_EVENT_FIXTURES.find(
      (f) => f.eventName === 'ReportSubmittedLedgerEvent',
    )!;

    expect(parseContractEvent(reportEvent).eventName).toBe('ReportEvent');
    expect(parseContractEvent(ledgerEvent).eventName).toBe('ReportSubmittedLedgerEvent');
  });

  it('maps positional values onto named fields in registry order', () => {
    const fixture = CONTRACT_EVENT_FIXTURES.find((f) => f.eventName === 'SettlementEvent')!;
    const parsed = parseContractEvent(fixture);

    expect(parsed.fields).toEqual({
      recipient: fixture.values[0],
      event_version: fixture.values[1],
      settlement_id: fixture.values[2],
      amount: fixture.values[3],
      proof_metadata: fixture.values[4],
      proof_present: fixture.values[5],
      timestamp: fixture.values[6],
    });
  });
});

describe('parseContractEvent — fixture/registry parity', () => {
  it('has exactly one compatibility-matrix row per fixture', () => {
    const matrix = getCompatibilityMatrix();
    expect(matrix).toHaveLength(CONTRACT_EVENT_FIXTURES.length);

    for (const fixture of CONTRACT_EVENT_FIXTURES) {
      const row = matrix.find(
        (r) =>
          r.eventName === fixture.eventName &&
          r.topic === fixture.topic &&
          r.eventVersion === fixture.eventVersion,
      );
      expect(row).toBeDefined();
      expect(row!.fieldOrder).toHaveLength(fixture.values.length);
    }
  });
});

describe('parseContractEvent — error classification (fail closed)', () => {
  it('throws UNKNOWN_TOPIC (non-retryable) for an unregistered topic', () => {
    expect.assertions(3);
    try {
      parseContractEvent({ topic: 'totally_unknown_topic', eventVersion: 1, values: [] });
    } catch (err) {
      expect(err).toBeInstanceOf(ContractEventParseError);
      expect((err as ContractEventParseError).code).toBe(EventParseErrorCode.UNKNOWN_TOPIC);
      expect((err as ContractEventParseError).retryable).toBe(false);
    }
  });

  it('throws UNSUPPORTED_VERSION (retryable) when the version is newer than known', () => {
    expect.assertions(3);
    try {
      parseContractEvent({ topic: 'confession_anchor', eventVersion: 99, values: [1, 2, 3] });
    } catch (err) {
      expect(err).toBeInstanceOf(ContractEventParseError);
      expect((err as ContractEventParseError).code).toBe(EventParseErrorCode.UNSUPPORTED_VERSION);
      expect((err as ContractEventParseError).retryable).toBe(true);
    }
  });

  it('throws UNSUPPORTED_VERSION (non-retryable) when the version is below the known range', () => {
    expect.assertions(3);
    try {
      parseContractEvent({ topic: 'confession_anchor', eventVersion: 0, values: [1, 2, 3] });
    } catch (err) {
      expect(err).toBeInstanceOf(ContractEventParseError);
      expect((err as ContractEventParseError).code).toBe(EventParseErrorCode.UNSUPPORTED_VERSION);
      expect((err as ContractEventParseError).retryable).toBe(false);
    }
  });

  it('throws MALFORMED_PAYLOAD (non-retryable) when field count does not match any known shape', () => {
    expect.assertions(4);
    try {
      parseContractEvent({ topic: 'confession_anchor', eventVersion: 1, values: [1, 2] });
    } catch (err) {
      expect(err).toBeInstanceOf(ContractEventParseError);
      expect((err as ContractEventParseError).code).toBe(EventParseErrorCode.MALFORMED_PAYLOAD);
      expect((err as ContractEventParseError).retryable).toBe(false);
      expect((err as ContractEventParseError).context.receivedFieldCount).toBe(2);
    }
  });

  it('does not depend on live Stellar RPC — parsing is a pure, synchronous function', () => {
    // No network client, provider, or async I/O is imported by this module.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const moduleSource = require('fs').readFileSync(
      require.resolve('./contract-event-parser'),
      'utf8',
    );
    expect(moduleSource).not.toMatch(/from ['"].*(soroban|rpc|http|axios).*['"]/i);
  });
});
