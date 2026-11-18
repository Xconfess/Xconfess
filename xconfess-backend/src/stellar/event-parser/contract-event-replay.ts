export type ContractEventReplayResult =
  | { accepted: true; expectedNonce: number }
  | { accepted: false; reason: 'duplicate' | 'stale' | 'out-of-order'; expectedNonce: number };

/**
 * In-memory, per-stream nonce guard for contract event consumers.
 * Callers should persist/recover the expected nonce in production checkpoints.
 */
export class ContractEventReplayGuard {
  private readonly nextNonce = new Map<string, number>();

  constructor(private readonly firstExpectedNonce = 1) {}

  accept(stream: string, nonce: number): ContractEventReplayResult {
    if (!Number.isSafeInteger(nonce) || nonce < 0) {
      return { accepted: false, reason: 'stale', expectedNonce: this.getExpected(stream) };
    }

    const expected = this.getExpected(stream);
    if (nonce < expected) {
      return { accepted: false, reason: nonce === expected - 1 ? 'duplicate' : 'stale', expectedNonce: expected };
    }
    if (nonce > expected) {
      return { accepted: false, reason: 'out-of-order', expectedNonce: expected };
    }

    this.nextNonce.set(stream, expected + 1);
    return { accepted: true, expectedNonce: expected };
  }

  getExpected(stream: string): number {
    return this.nextNonce.get(stream) ?? this.firstExpectedNonce;
  }

  reset(stream?: string): void {
    if (stream) {
      this.nextNonce.delete(stream);
    } else {
      this.nextNonce.clear();
    }
  }
}
