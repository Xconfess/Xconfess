# Test Utils and Seed Helpers Documentation

This directory contains utilities and factory helpers for creating reproducible test data, specifically designed to address the challenge of testing pending anchor and tip states in the Xconfess backend.

## Overview

The seed helpers located in `factories/` provide deterministic, reusable methods for creating complex test scenarios without manual data crafting. This significantly reduces setup time and ensures test consistency across the development team.

## Available Factories

### AnchorFactory (`anchor-factory.ts`)

Creates confessions with various anchor states for testing blockchain anchoring workflows.

#### Key Methods:

- **`buildPendingAnchor()`** - Creates a confession with stellar transaction data but not yet anchored
- **`buildReadyForAnchoring()`** - Creates a confession ready for anchoring (no stellar data yet)
- **`buildAnchored()`** - Creates a fully anchored confession
- **`buildFailedAnchor()`** - Creates a confession where anchoring failed
- **`buildMixedAnchorStates(count)`** - Creates multiple confessions with mixed anchor states
- **`buildDeterministic()`** - Creates reproducible test data for consistent testing

#### Usage Examples:

```typescript
import { AnchorFactory } from '../test/utils/factories';

// Test pending anchor workflow
const pendingConfession = AnchorFactory.buildPendingAnchor();
expect(pendingConfession.stellarTxHash).toBeTruthy();
expect(pendingConfession.isAnchored).toBe(false);

// Test complete anchor lifecycle
const ready = AnchorFactory.buildReadyForAnchoring();
const pending = AnchorFactory.buildPendingAnchor({ id: ready.id });
const anchored = AnchorFactory.buildAnchored({ id: pending.id });

// Test comprehensive scenarios
const mixedStates = AnchorFactory.buildMixedAnchorStates(10);
const pendingCount = mixedStates.filter(c => !c.isAnchored && c.stellarTxHash).length;
```

#### When to Use:

- Testing blockchain anchoring workflows
- Verifying Stellar transaction processing
- Testing anchor state transitions
- Performance testing with large datasets
- Creating reproducible test scenarios

### TipFactory (`tip-factory.ts`)

Creates tips with various states for testing tipping workflows and verification processes.

#### Key Methods:

- **`buildPendingTip(confessionId?)`** - Creates a tip waiting for blockchain verification
- **`buildVerifiedTip(confessionId?)`** - Creates a fully verified and processed tip
- **`buildAnonymousTip(confessionId?)`** - Creates an anonymous tip (no sender address)
- **`buildInvalidTip(confessionId?)`** - Creates a tip with invalid transaction data
- **`buildMinimumTip(confessionId?)`** - Creates a tip with minimum allowed amount (0.1 XLM)
- **`buildLargeTip(confessionId?)`** - Creates a tip with large amount for edge case testing
- **`buildMixedTipsForConfession(confessionId, count)`** - Creates multiple tips with mixed states
- **`buildConfessionWithTips(tipCount)`** - Creates both confession and associated tips
- **`buildDeterministic(confessionId?)`** - Creates reproducible test data
- **`buildPendingVerificationBatch(confessionId, count)`** - Creates tips for verification workflow testing

#### Usage Examples:

```typescript
import { TipFactory } from '../test/utils/factories';

// Test tip verification workflow
const pendingTip = TipFactory.buildPendingTip('confession-123');
expect(pendingTip.txId).toMatch(/^[a-f0-9]{64}$/i);
expect(pendingTip.amount).toBeGreaterThanOrEqual(0.1);

// Test anonymous tipping
const anonymousTip = TipFactory.buildAnonymousTip('confession-123');
expect(anonymousTip.senderAddress).toBeNull();

// Test comprehensive tip scenarios
const { confession, tips } = TipFactory.buildConfessionWithTips(5);
expect(tips.length).toBe(5);
tips.forEach(tip => expect(tip.confessionId).toBe(confession.id));

// Test verification batch processing
const batch = TipFactory.buildPendingVerificationBatch('confession-123', 3);
expect(batch[0].amount).toBe(0.5);
expect(batch[1].amount).toBe(0.75);
```

#### When to Use:

- Testing tip verification workflows
- Testing anonymous tipping functionality
- Testing tip statistics and aggregation
- Performance testing with large tip datasets
- Creating comprehensive tip scenarios
- Testing edge cases (minimum/maximum amounts, invalid transactions)

## Integration with Existing Tests

### Updating Existing Tests

To integrate these helpers into existing tests:

1. **Import the factory**:
   ```typescript
   import { AnchorFactory, TipFactory } from '../test/utils/factories';
   ```

2. **Replace manual data creation**:
   ```typescript
   // Before (manual setup)
   const confession = new AnonymousConfession();
   confession.id = 'test-id';
   confession.message = 'test message';
   confession.stellarTxHash = 'a1b2c3...';
   // ... more manual setup
   
   // After (using factory)
   const confession = AnchorFactory.buildPendingAnchor({
     id: 'test-id',
     message: 'test message'
   });
   ```

3. **Use deterministic data for consistency**:
   ```typescript
   // For tests that need consistent data
   const confession = AnchorFactory.buildDeterministic();
   const tip = TipFactory.buildDeterministic(confession.id);
   ```

### Test Patterns

#### Pattern 1: Workflow Testing
```typescript
describe('Anchor Workflow', () => {
  it('should handle complete anchor lifecycle', () => {
    const ready = AnchorFactory.buildReadyForAnchoring();
    const pending = AnchorFactory.buildPendingAnchor({ id: ready.id });
    const anchored = AnchorFactory.buildAnchored({ id: pending.id });
    
    // Test workflow transitions
  });
});
```

#### Pattern 2: State Testing
```typescript
describe('Pending States', () => {
  it('should handle pending anchors', () => {
    const pending = AnchorFactory.buildPendingAnchor();
    expect(pending.isAnchored).toBe(false);
    expect(pending.stellarTxHash).toBeTruthy();
  });
  
  it('should handle pending tips', () => {
    const pending = TipFactory.buildPendingTip();
    expect(pending.txId).toMatch(/^[a-f0-9]{64}$/i);
  });
});
```

#### Pattern 3: Performance Testing
```typescript
describe('Performance Tests', () => {
  it('should handle large datasets efficiently', () => {
    const startTime = Date.now();
    const largeBatch = AnchorFactory.buildMixedAnchorStates(1000);
    const endTime = Date.now();
    
    expect(endTime - startTime).toBeLessThan(5000);
    expect(largeBatch.length).toBe(1000);
  });
});
```

## Best Practices

### 1. Use Deterministic Data for Critical Tests
```typescript
// Good: Reproducible
const confession = AnchorFactory.buildDeterministic();

// Avoid: Non-deterministic in critical tests
const confession = AnchorFactory.buildPendingAnchor(); // Random data
```

### 2. Leverage Mixed States for Comprehensive Testing
```typescript
// Test multiple scenarios in one test
const mixedStates = AnchorFactory.buildMixedAnchorStates(20);
const pendingCount = mixedStates.filter(c => !c.isAnchored && c.stellarTxHash).length;
const anchoredCount = mixedStates.filter(c => c.isAnchored).length;
```

### 3. Use Specific Builders for Edge Cases
```typescript
// Test minimum amounts
const minTip = TipFactory.buildMinimumTip();

// Test invalid transactions
const invalidTip = TipFactory.buildInvalidTip();

// Test anonymous scenarios
const anonymousTip = TipFactory.buildAnonymousTip();
```

### 4. Combine Factories for Complex Scenarios
```typescript
// Create complete test scenarios
const { confession, tips } = TipFactory.buildConfessionWithTips(5);
const anchoredConfession = AnchorFactory.buildAnchored({
  id: confession.id,
  message: confession.message
});
```

## Migration Guide

### From Manual Setup to Factory Usage

**Before:**
```typescript
// Manual setup - error-prone and verbose
const confession = new AnonymousConfession();
confession.id = 'test-id';
confession.message = 'test message';
confession.stellarTxHash = 'a1b2c3d4e5f6...'; // 64 chars
confession.stellarHash = 'f6e5d4c3b2a1...'; // 64 chars
confession.isAnchored = false;
confession.anchoredAt = null;
// ... more fields
```

**After:**
```typescript
// Factory usage - simple and reliable
const confession = AnchorFactory.buildPendingAnchor({
  id: 'test-id',
  message: 'test message'
});
```

### Benefits of Migration

1. **Reduced Setup Time**: No more manual data crafting
2. **Consistency**: Standardized data formats
3. **Maintainability**: Centralized factory logic
4. **Test Coverage**: Built-in edge cases and scenarios
5. **Performance**: Optimized for batch creation

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure proper import path
   ```typescript
   import { AnchorFactory } from '../test/utils/factories';
   ```

2. **Type Mismatches**: Use proper overrides
   ```typescript
   const confession = AnchorFactory.buildPendingAnchor({
     customField: 'value' // Type-safe overrides
   });
   ```

3. **Deterministic Data Not Working**: Ensure using deterministic methods
   ```typescript
   // Use this for reproducible tests
   const confession = AnchorFactory.buildDeterministic();
   
   // Not this (random data)
   const confession = AnchorFactory.buildPendingAnchor();
   ```

### Performance Tips

1. **Batch Creation**: Use batch methods for large datasets
   ```typescript
   const batch = AnchorFactory.buildMixedAnchorStates(100);
   ```

2. **Reuse Deterministic Data**: Cache deterministic instances
   ```typescript
   const deterministicConfession = AnchorFactory.buildDeterministic();
   // Use across multiple tests
   ```

## Contributing

When adding new factory methods:

1. **Follow Naming Conventions**: Use descriptive names like `buildPendingAnchor`
2. **Include Documentation**: Add JSDoc comments explaining usage
3. **Provide Examples**: Include usage examples in comments
4. **Test Thoroughly**: Add comprehensive tests for new methods
5. **Consider Edge Cases**: Include methods for edge cases and error scenarios

## Future Enhancements

Potential future additions:

1. **Database Seeding Helpers**: Methods for database seeding in development
2. **Mock Data Generators**: Integration with mock external services
3. **State Machine Helpers**: Methods for testing state transitions
4. **Performance Benchmarks**: Built-in performance testing utilities
5. **Integration Test Helpers**: Methods for end-to-end test scenarios

These seed helpers provide a solid foundation for testing complex blockchain and tipping workflows while maintaining code quality and developer productivity.
