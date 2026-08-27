import type { UseWalletReturn } from "@/lib/hooks/useWallet";

/**
 * Create mock functions for wallet testing
 * Returns jest mock functions that can be configured in tests
 */
export const createWalletMocks = () => ({
  connect: () => ({ mockImplementation: () => Promise.resolve(undefined) }),
  disconnect: () => ({ mockImplementation: () => {} }),
  signTransaction: () => ({ mockImplementation: () => Promise.resolve("signed-xdr") }),
  checkConnection: () => ({ mockImplementation: () => Promise.resolve(undefined) }),
  switchNetwork: () => ({ mockImplementation: () => {} }),
  clearError: () => ({ mockImplementation: () => {} }),
});

/**
 * Create base wallet state with mock functions
 * Should be called within test files where jest is available
 */
export const createBaseWalletState = (): UseWalletReturn => {
  return {
    publicKey: null,
    network: "TESTNET_SOROBAN",
    isConnected: false,
    isLoading: false,
    error: null,
    isFreighterInstalled: true,
    isReady: false,
    readinessError: null,
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
    checkConnection: jest.fn().mockResolvedValue(undefined),
    switchNetwork: jest.fn(),
    clearError: jest.fn(),
  };
};

/**
 * Wallet is completely disconnected and ready to connect
 */
export const disconnectedWallet = (): UseWalletReturn => ({
  ...createBaseWalletState(),
  isReady: true,
  readinessError: null,
});

/**
 * Wallet is connected to TESTNET with a valid public key
 */
export const connectedWallet = (): UseWalletReturn => ({
  ...createBaseWalletState(),
  publicKey: "GCONNECTEDWALLET1234567890ABCDEFGHIJKLMNOPQRSTUVWX",
  network: "TESTNET_SOROBAN",
  isConnected: true,
  isReady: true,
  readinessError: null,
});

/**
 * Wallet is connected to PUBLIC_NETWORK with a valid public key
 */
export const connectedMainnetWallet = (): UseWalletReturn => ({
  ...createBaseWalletState(),
  publicKey: "GPUBLICNETWORK1234567890ABCDEFGHIJKLMNOPQRSTUVWX",
  network: "PUBLIC_NETWORK",
  isConnected: true,
  isReady: true,
  readinessError: null,
});

/**
 * Wallet is on wrong network (not TESTNET_SOROBAN)
 */
export const wrongNetworkWallet = (): UseWalletReturn => ({
  ...createBaseWalletState(),
  publicKey: "GWRONGNETWORK1234567890ABCDEFGHIJKLMNOPQRSTUVWX",
  network: "PUBLIC_NETWORK",
  isConnected: true,
  isReady: false,
  readinessError: "Wrong network. Please switch to TESTNET_SOROBAN",
});

/**
 * Wallet is not installed
 */
export const walletNotInstalled = (): UseWalletReturn => ({
  ...createBaseWalletState(),
  isFreighterInstalled: false,
  isReady: false,
  readinessError: "Freighter wallet is not installed",
});

/**
 * Wallet is in loading state
 */
export const loadingWallet = (): UseWalletReturn => ({
  ...createBaseWalletState(),
  isLoading: true,
  isReady: false,
});

/**
 * Wallet has a general error
 */
export const walletWithError = (): UseWalletReturn => ({
  ...createBaseWalletState(),
  error: "Failed to connect wallet",
  isReady: false,
  readinessError: "Failed to connect wallet",
});

/**
 * Wallet is connected but not ready (readiness check failed)
 */
export const connectedNotReadyWallet = (): UseWalletReturn => ({
  ...createBaseWalletState(),
  publicKey: "GNOTREADYWALLET1234567890ABCDEFGHIJKLMNOPQRSTUVWX",
  network: "TESTNET_SOROBAN",
  isConnected: true,
  isReady: false,
  readinessError: "Wallet not ready for transactions",
});

/**
 * Helper function to create custom wallet overrides
 * Useful for tests that need specific combinations of states
 */
export const createWalletMock = (
  overrides: Partial<UseWalletReturn> = {}
): UseWalletReturn => ({
  ...createBaseWalletState(),
  ...overrides,
});

/**
 * Mock Freighter API for window object testing
 */
export const mockFreighterAPI = {
  getPublicKey: () => ({ mockResolvedValue: "GMOCKFREIGHTER1234567890ABCDEFGHIJKLMNOPQRSTUVWX" }),
  getNetwork: () => ({ mockResolvedValue: "TESTNET_SOROBAN" }),
  signTransaction: () => ({ mockResolvedValue: "signed-transaction-xdr" }),
  isAllowed: () => ({ mockResolvedValue: true }),
  isConnected: () => ({ mockResolvedValue: true }),
};

/**
 * Mock legacy Freighter (window.freighter) for backward compatibility
 */
export const mockLegacyFreighter = {
  getPublicKey: () => ({ mockResolvedValue: "GMOCKLEGACY1234567890ABCDEFGHIJKLMNOPQRSTUVWX" }),
  getNetwork: () => ({ mockResolvedValue: "TESTNET_SOROBAN" }),
  signTransaction: () => ({ mockResolvedValue: "signed-legacy-xdr" }),
};

/**
 * Setup window mocks for wallet testing
 */
export const setupWindowMocks = (options: {
  hasFreighterAPI?: boolean;
  hasLegacyFreighter?: boolean;
  freighterAPI?: any;
  legacyFreighter?: any;
} = {}) => {
  const {
    hasFreighterAPI = true,
    hasLegacyFreighter = false,
    freighterAPI = mockFreighterAPI,
    legacyFreighter = mockLegacyFreighter,
  } = options;

  // Clear existing mocks
  delete (window as any).freighter;
  delete (window as any).freighterApi;

  // Setup mocks based on options
  if (hasFreighterAPI) {
    (window as any).freighterApi = freighterAPI;
  }
  if (hasLegacyFreighter) {
    (window as any).freighter = legacyFreighter;
  }
};

/**
 * Clear all window wallet mocks
 */
export const clearWindowMocks = () => {
  delete (window as any).freighter;
  delete (window as any).freighterApi;
};
