import { getAddress, getNetwork, requestAccess } from '@stellar/freighter-api';
import { freighterConnect, freighterDisconnect } from '../../lib/wallet/freighterAdapter';
import { walletStateManager } from '../../lib/wallet/wallet-state';

jest.mock('@stellar/freighter-api', () => ({
  getAddress: jest.fn(),
  getNetwork: jest.fn(),
  isConnected: jest.fn(),
  requestAccess: jest.fn(),
  signTransaction: jest.fn(),
}));

describe('Freighter connection monitoring', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    walletStateManager.clearState();
    jest.mocked(requestAccess).mockResolvedValue({ address: 'original-account' });
    jest.mocked(getAddress).mockResolvedValue({ address: 'original-account' });
    jest.mocked(getNetwork).mockResolvedValue({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' });
  });

  afterEach(async () => {
    await freighterDisconnect();
    jest.useRealTimers();
  });

  it('clears a changed account without opening another access prompt', async () => {
    await freighterConnect();
    jest.mocked(getAddress).mockResolvedValue({ address: 'different-account' });

    await jest.advanceTimersByTimeAsync(walletStateManager.getStateCheckInterval());

    expect(walletStateManager.hasValidState()).toBe(false);
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not restore a session when an in-flight poll finishes after disconnect', async () => {
    let completePoll!: (value: Awaited<ReturnType<typeof getAddress>>) => void;
    jest.mocked(getAddress).mockImplementationOnce(() => new Promise((resolve) => {
      completePoll = resolve;
    }));
    await freighterConnect();
    jest.advanceTimersByTime(walletStateManager.getStateCheckInterval());
    await freighterDisconnect();

    completePoll({ address: 'original-account' });
    await jest.advanceTimersByTimeAsync(0);

    expect(walletStateManager.hasValidState()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});
