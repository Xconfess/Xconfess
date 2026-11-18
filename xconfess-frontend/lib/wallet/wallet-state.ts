/**
 * Wallet state management with connection recovery.
 * Handles stale state clearing on disconnect and account change detection.
 */

interface WalletState {
  publicKey: string | null;
  network: string | null;
  isConnected: boolean;
  lastCheckedAt: number;
}

class WalletStateManager {
  private state: WalletState = {
    publicKey: null,
    network: null,
    isConnected: false,
    lastCheckedAt: 0,
  };

  private stateCheckIntervalMs = 5000; // Check every 5 seconds

  getState(): Readonly<WalletState> {
    return { ...this.state };
  }

  setConnected(publicKey: string, network: string): void {
    this.state = {
      publicKey,
      network,
      isConnected: true,
      lastCheckedAt: Date.now(),
    };
  }

  clearState(): void {
    this.state = {
      publicKey: null,
      network: null,
      isConnected: false,
      lastCheckedAt: Date.now(),
    };
  }

  hasValidState(): boolean {
    return (
      this.state.isConnected &&
      this.state.publicKey !== null &&
      this.state.network !== null
    );
  }

  isStateStale(maxAgeMs = 60000): boolean {
    if (!this.hasValidState()) return true;
    return Date.now() - this.state.lastCheckedAt > maxAgeMs;
  }

  async detectAccountChange(
    currentPublicKey: string | null,
  ): Promise<{ changed: boolean; previousKey: string | null }> {
    const previousKey = this.state.publicKey;
    const changed = previousKey !== null && previousKey !== currentPublicKey;

    if (changed) {
      this.clearState();
    }

    return { changed, previousKey };
  }

  getStateCheckInterval(): number {
    return this.stateCheckIntervalMs;
  }
}

export const walletStateManager = new WalletStateManager();
