# Test Fixtures Documentation

This directory contains shared test fixtures for reproducible frontend testing across wallet, anchor, and tipping features.

## Files

- `wallet-fixtures.ts` - Shared wallet state mocks and helper functions
- `anchor-fixtures.ts` - Shared anchor state mocks and result configurations
- `handlers.ts` - MSW API mock handlers
- `server.ts` - MSW server setup

## Wallet Fixtures (`wallet-fixtures.ts`)

### Available Wallet States

#### `disconnectedWallet()`
Wallet is completely disconnected and ready to connect.
- `isReady: true`
- `isConnected: false`
- `publicKey: null`

#### `connectedWallet()`
Wallet is connected to TESTNET with a valid public key.
- `isReady: true`
- `isConnected: true`
- `publicKey: "GCONNECTEDWALLET1234567890ABCDEFGHIJKLMNOPQRSTUVWX"`
- `network: "TESTNET_SOROBAN"`

#### `connectedMainnetWallet()`
Wallet is connected to PUBLIC_NETWORK with a valid public key.
- `isReady: true`
- `isConnected: true`
- `publicKey: "GPUBLICNETWORK1234567890ABCDEFGHIJKLMNOPQRSTUVWX"`
- `network: "PUBLIC_NETWORK"`

#### `wrongNetworkWallet()`
Wallet is connected but on wrong network.
- `isReady: false`
- `isConnected: true`
- `readinessError: "Wrong network. Please switch to TESTNET_SOROBAN"`

#### `walletNotInstalled()`
Freighter wallet is not installed.
- `isReady: false`
- `isFreighterInstalled: false`
- `readinessError: "Freighter wallet is not installed"`

#### `loadingWallet()`
Wallet is in loading state.
- `isLoading: true`
- `isReady: false`

#### `walletWithError()`
Wallet has a general error.
- `error: "Failed to connect wallet"`
- `isReady: false`

#### `connectedNotReadyWallet()`
Wallet is connected but not ready for transactions.
- `isConnected: true`
- `isReady: false`
- `readinessError: "Wallet not ready for transactions"`

### Helper Functions

#### `createWalletMock(overrides)`
Creates a custom wallet state with optional overrides.
```typescript
const customWallet = createWalletMock({
  isConnected: true,
  publicKey: "GCUSTOM1234567890ABCDEFGHIJKLMNOPQRSTUVWX",
  error: "Custom error message"
});
```

#### `setupWindowMocks(options)`
Sets up window mocks for wallet API testing.
```typescript
setupWindowMocks({
  hasFreighterAPI: true,
  hasLegacyFreighter: false,
  freighterAPI: customFreighterAPI
});
```

#### `clearWindowMocks()`
Clears all window wallet mocks.

## Anchor Fixtures (`anchor-fixtures.ts`)

### Available Anchor States

#### `readyForAnchor()`
Stellar wallet is ready for anchoring (connected and on correct network).
- `isReady: true`
- `isConnected: true`
- `network: "TESTNET_SOROBAN"`

#### `notConnectedForAnchor()`
Stellar wallet is not connected.
- `isReady: false`
- `isConnected: false`
- `readinessError: "Wallet not connected"`

#### `wrongNetworkForAnchor()`
Stellar wallet is on wrong network for anchoring.
- `isReady: false`
- `readinessError: "Wrong network. Please switch to TESTNET_SOROBAN"`

#### `walletNotInstalledForAnchor()`
Freighter wallet is not installed.
- `isReady: false`
- `readinessError: "Freighter wallet is not installed"`

#### `loadingForAnchor()`
Stellar wallet is in loading state.
- `isLoading: true`
- `isReady: false`

#### `anchorError()`
Stellar wallet has anchor-specific error.
- `error: "Failed to anchor confession: insufficient balance"`
- `isReady: false`

### Helper Functions

#### `createAnchorMock(overrides)`
Creates a custom anchor state with optional overrides.

#### `getAnchorMockResult(scenario)`
Returns mock result for different anchor scenarios:
- `'success'` - Successful anchoring with transaction hash
- `'error'` - General anchoring error
- `'network'` - Network-related error
- `'rejected'` - User rejected transaction
- `'timeout'` - Wallet request timeout

#### `getAnchorFetchMockResponse(scenario)`
Returns mock fetch response for anchor API calls:
- `'success'` - Successful API response
- `'error'` - API error response
- `'demo'` - Demo mode response

## Usage Examples

### Wallet Testing

```typescript
import { connectedWallet, disconnectedWallet } from '@/tests/mocks/wallet-fixtures';

describe("MyComponent", () => {
  it("shows connect button when wallet is disconnected", () => {
    mockUseWallet.mockReturnValue(disconnectedWallet());
    // ... test implementation
  });

  it("shows wallet info when connected", () => {
    mockUseWallet.mockReturnValue(connectedWallet());
    // ... test implementation
  });
});
```

### Anchor Testing

```typescript
import { 
  readyForAnchor, 
  getAnchorMockResult,
  getAnchorFetchMockResponse 
} from '@/tests/mocks/anchor-fixtures';

describe("AnchorComponent", () => {
  it("anchors successfully when wallet is ready", () => {
    mockUseStellarWallet.mockReturnValue(readyForAnchor());
    mockAnchorFunction.mockResolvedValue(getAnchorMockResult('success'));
    // ... test implementation
  });

  it("handles network errors gracefully", () => {
    mockAnchorFetch.mockResolvedValue(getAnchorFetchMockResponse('error'));
    // ... test implementation
  });
});
```

## Best Practices

1. **Use specific fixtures**: Prefer specific fixtures like `connectedWallet()` over generic `createWalletMock()` when testing standard scenarios.

2. **Keep fixtures deterministic**: All fixtures return consistent, predictable values for reproducible tests.

3. **Extend when needed**: Use `createWalletMock()` or `createAnchorMock()` for custom scenarios not covered by predefined fixtures.

4. **Test error states**: Use error-specific fixtures to ensure proper error handling.

5. **Mock window APIs**: Use `setupWindowMocks()` and `clearWindowMocks()` for wallet API integration tests.

## Contributing

When adding new fixtures:

1. Follow the naming convention: descriptive names ending in the state being mocked
2. Include comprehensive JSDoc comments
3. Add helper functions for common variations
4. Update this README with new fixtures
5. Add usage examples for complex scenarios

## Migration Notes

These fixtures replace the previous pattern of hand-rolling wallet mocks in each test file. When migrating existing tests:

1. Replace inline wallet mock objects with fixture imports
2. Update test setup to use fixture functions
3. Ensure test expectations still pass with new fixture values
4. Remove duplicate mock setup code
