import type { StellarWalletState } from "@/lib/hooks/useStellarWallet";

/**
 * Shared anchor fixtures for reproducible frontend testing
 * 
 * These fixtures provide deterministic anchor state mocks that can be imported
 * and reused across confession and anchoring tests.
 */

const baseStellarWalletState: StellarWalletState = {
  isAvailable: true,
  isConnected: false,
  publicKey: null,
  network: "TESTNET_SOROBAN",
  isLoading: false,
  error: null,
  isReady: false,
  readinessError: null,
};

/**
 * Stellar wallet is ready for anchoring (connected and on correct network)
 */
export const readyForAnchor = (): StellarWalletState => ({
  ...baseStellarWalletState,
  isConnected: true,
  publicKey: "GREADYFORANCHOR1234567890ABCDEFGHIJKLMNOPQRSTUVWX",
  network: "TESTNET_SOROBAN",
  isReady: true,
  readinessError: null,
});

/**
 * Stellar wallet is not connected
 */
export const notConnectedForAnchor = (): StellarWalletState => ({
  ...baseStellarWalletState,
  isConnected: false,
  publicKey: null,
  isReady: false,
  readinessError: "Wallet not connected",
});

/**
 * Stellar wallet is on wrong network for anchoring
 */
export const wrongNetworkForAnchor = (): StellarWalletState => ({
  ...baseStellarWalletState,
  isConnected: true,
  publicKey: "GWRONGNETWORK1234567890ABCDEFGHIJKLMNOPQRSTUVWX",
  network: "PUBLIC_NETWORK",
  isReady: false,
  readinessError: "Wrong network. Please switch to TESTNET_SOROBAN",
});

/**
 * Stellar wallet is not installed
 */
export const walletNotInstalledForAnchor = (): StellarWalletState => ({
  ...baseStellarWalletState,
  isAvailable: false,
  isReady: false,
  readinessError: "Freighter wallet is not installed",
});

/**
 * Stellar wallet is in loading state
 */
export const loadingForAnchor = (): StellarWalletState => ({
  ...baseStellarWalletState,
  isLoading: true,
  isReady: false,
});

/**
 * Stellar wallet has anchor-specific error
 */
export const anchorError = (): StellarWalletState => ({
  ...baseStellarWalletState,
  isConnected: true,
  publicKey: "GANCHORERROR1234567890ABCDEFGHIJKLMNOPQRSTUVWX",
  network: "TESTNET_SOROBAN",
  error: "Failed to anchor confession: insufficient balance",
  isReady: false,
});

/**
 * Helper function to create custom anchor state overrides
 */
export const createAnchorMock = (
  overrides: Partial<StellarWalletState> = {}
): StellarWalletState => ({
  ...baseStellarWalletState,
  ...overrides,
});

/**
 * Mock successful anchor result
 */
export const successfulAnchorResult = {
  success: true,
  txHash: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890",
  stellarExplorerUrl: "https://stellar.expert/explorer/testnet/tx/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890",
};

/**
 * Mock failed anchor result with common error
 */
export const failedAnchorResult = {
  success: false,
  error: "Transaction failed: insufficient balance",
};

/**
 * Mock anchor result with network error
 */
export const networkErrorAnchorResult = {
  success: false,
  error: "Network error: unable to submit transaction",
};

/**
 * Mock anchor result with user rejection
 */
export const rejectedAnchorResult = {
  success: false,
  error: "Transaction was rejected in your wallet. Review details and retry when ready.",
};

/**
 * Mock anchor result with timeout
 */
export const timeoutAnchorResult = {
  success: false,
  error: "Wallet request timed out. Open Freighter, approve if pending, then retry.",
};

/**
 * Mock anchor API response (POST /api/confessions/[id]/anchor)
 */
export const mockAnchorApiResponse = {
  success: {
    id: "confession-123",
    stellarTxHash: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890",
    isAnchored: true,
    anchoredAt: "2024-04-24T14:00:00.000Z",
    stellarExplorerUrl: "https://stellar.expert/explorer/testnet/tx/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890",
  },
  error: {
    error: "Invalid transaction hash format",
    code: "BAD_REQUEST",
  },
  demo: {
    id: "confession-123",
    stellarTxHash: "demo-tx-hash-1234567890abcdef1234567890abcdef1234567890",
    isAnchored: true,
    anchoredAt: "2024-04-24T14:00:00.000Z",
    stellarExplorerUrl: "https://stellar.expert/explorer/testnet/tx/demo-tx-hash-1234567890abcdef1234567890abcdef1234567890",
    _demo: true,
  },
};

/**
 * Get mock anchor function configuration for different scenarios
 * Returns the resolved value that should be used with jest.fn().mockResolvedValue()
 */
export const getAnchorMockResult = (scenario: 'success' | 'error' | 'network' | 'rejected' | 'timeout') => {
  switch (scenario) {
    case 'success':
      return successfulAnchorResult;
    case 'error':
      return failedAnchorResult;
    case 'network':
      return networkErrorAnchorResult;
    case 'rejected':
      return rejectedAnchorResult;
    case 'timeout':
      return timeoutAnchorResult;
    default:
      return successfulAnchorResult;
  }
};

/**
 * Get mock fetch response configuration for anchor API calls
 * Returns the resolved value that should be used with jest.fn().mockResolvedValue()
 */
export const getAnchorFetchMockResponse = (scenario: 'success' | 'error' | 'demo') => {
  const mockResponse = (data: any, status = 200) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
    } as Response);

  switch (scenario) {
    case 'success':
      return mockResponse(mockAnchorApiResponse.success);
    case 'error':
      return mockResponse(mockAnchorApiResponse.error, 400);
    case 'demo':
      return mockResponse(mockAnchorApiResponse.demo, 200);
    default:
      return mockResponse(mockAnchorApiResponse.success);
  }
};
