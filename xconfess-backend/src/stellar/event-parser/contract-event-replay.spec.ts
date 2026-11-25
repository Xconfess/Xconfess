import { CONTRACT_EVENT_FIXTURES } from './contract-event-fixtures';
import { ContractEventReplayGuard } from './contract-event-replay';

const CATEGORIES = ['confession', 'reaction', 'report', 'role', 'reputation', 'governance'];

describe('contract event nonce replay guard', () => {
  it('accepts each category fixture in deterministic nonce order', () => {
    const guard = new ContractEventReplayGuard();

    for (const category of CATEGORIES) {
      const fixture = CONTRACT_EVENT_FIXTURES.find((candidate) => candidate.category === category);
      expect(fixture).toBeDefined();

      const stream = `${category}:${String(fixture!.topic)}:1`;
      expect(guard.accept(stream, 1).accepted).toBe(true);
      expect(guard.accept(stream, 2).accepted).toBe(true);
    }
  });

  it('rejects duplicate and stale events without advancing state', () => {
    const guard = new ContractEventReplayGuard();

    expect(guard.accept('confession:42', 1)).toEqual({ accepted: true, expectedNonce: 1 });
    expect(guard.accept('confession:42', 1).accepted).toBe(false);
    expect(guard.accept('confession:42', 0).accepted).toBe(false);
    expect(guard.getExpected('confession:42')).toBe(2);
  });

  it('rejects out-of-order future nonces and later accepts the expected nonce', () => {
    const guard = new ContractEventReplayGuard();

    expect(guard.accept('report:42', 3).accepted).toBe(false);
    expect(guard.accept('report:42', 1).accepted).toBe(true);
    expect(guard.accept('report:42', 2).accepted).toBe(true);
  });

  it('keeps streams isolated', () => {
    const guard = new ContractEventReplayGuard();

    expect(guard.accept('role:user-A', 1).accepted).toBe(true);
    expect(guard.accept('role:user-B', 1).accepted).toBe(true);
  });
});
