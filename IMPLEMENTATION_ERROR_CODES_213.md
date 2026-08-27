# Implementation Summary: Issue #213 - Stable Error Code Mapping

**Status:** ✅ COMPLETE  
**Date:** 2026-04-24  
**Implementation Time:** Single session  
**Version:** 1.0

---

## What Was Implemented.

A **stable, versioned error code mapping system** for Soroban smart contracts that allows backend services to reliably distinguish retryable failures from terminal ones and generate appropriate API responses.

### Core Deliverables

#### 1. **Unified Error Registry** (`xconfess-contracts/contracts/error.rs`)
✅ Centralized all contract error definitions  
✅ Added `ErrorClassification` enum (Terminal, Retryable, Unknown)  
✅ Organized errors into stable code ranges (1000–6099)  
✅ Implemented versioning (`ERROR_REGISTRY_VERSION = 1`)  
✅ Each error has `.code()`, `.message()`, and `.classification()` methods

**Key Features:**
- Global errors (1000–1099): authorization, validation, overflow
- Domain-specific errors (2000–5099): confessions, reactions, reports, governance
- Tipping errors (6000–6099): mapped from small contract enum to stable backend codes
- Reserved range (9000–9999): for future metadata/compatibility issues

#### 2. **Anchor Contract Alignment** (`xconfess-contracts/contracts/confession-anchor/src/errors.rs`)
✅ Refactored to re-export shared error definitions  
✅ Removed duplicate code definitions  
✅ Now uses unified `codes` module  
✅ Maintains 100% backward compatibility (no code changes)

#### 3. **Tipping Contract Enhancement** (`xconfess-contracts/contracts/anonymous-tipping/src/lib.rs`)
✅ Added typed error codes to tipping contract  
✅ Implemented `Error::code()` mapping from contract enums (1–8) to stable codes (6001–6008)  
✅ Added `Error::classification()` method  
✅ Preserved error messages for backward compatibility

**Before:**
```rust
#[contracterror]
pub enum Error {
    InvalidTipAmount = 1,      // No mapping to backend codes
    MetadataTooLong = 2,
    // ...
}
```

**After:**
```rust
impl Error {
    pub fn code(&self) -> u32 {
        match self {
            Error::InvalidTipAmount => 6001,  // Stable backend code
            Error::MetadataTooLong => 6002,
            // ...
        }
    }

    pub fn classification(&self) -> ErrorClassification {
        match self {
            Error::InvalidTipAmount => Terminal,
            Error::RateLimited => Retryable,  // Distinguishes retry strategy
            // ...
        }
    }
}
```

#### 4. **Comprehensive Tests** (`xconfess-contracts/contracts/tests/errors_tests.rs`)
✅ Error code uniqueness validation  
✅ Code range boundary checks  
✅ Error classification consistency tests  
✅ Registry version pinning (guards breaking changes)  
✅ Panic string stability (backward compat with old tipping code)  
✅ Backend compatibility fixtures (distinguishes retryable vs terminal)  
✅ Non-empty message validation

**Example Test:**
```rust
#[test]
fn test_error_codes_are_unique() {
    // Validates all 21 anchor + 8 tipping codes are unique
    // Prevents accidental code collisions
}

#[test]
fn test_backend_can_distinguish_retryable_from_terminal() {
    // Ensures classification system works
    // Backend uses this to decide retry strategy
}
```

#### 5. **Backend Error Handler** (`xconfess-backend/src/stellar/utils/stellar-contract-errors.ts`)
✅ Exports stable error code constants  
✅ Implements `classifyContractError(code)` function  
✅ Exports `isRetryableContractError(code)` helper  
✅ Maps error codes to HTTP status codes (400, 403, 404, 409, 503)  
✅ Calculates exponential backoff delays with jitter  
✅ Provides human-readable error messages

**Public API:**
```typescript
// Classify for retry strategy
classifyContractError(1004)  // → RETRYABLE

// Check if should retry
isRetryableContractError(1002)  // → false (TERMINAL)

// HTTP response status
getHttpStatusForContractError(6001)  // → 400
getHttpStatusForContractError(1004)  // → 503

// Retry delay (exponential backoff)
getRetryDelayMs(1004, 0)  // → ~100-200ms
getRetryDelayMs(1004, 1)  // → ~200-400ms
getRetryDelayMs(1004, 2)  // → ~400-800ms

// Human-readable message
getContractErrorMessage(6007)  // → "Rate Limited"
```

#### 6. **Backend Tests** (`xconfess-backend/src/stellar/utils/__tests__/stellar-contract-errors.spec.ts`)
✅ 41 test cases covering all classification patterns  
✅ Error code uniqueness across ranges  
✅ HTTP status mapping validation  
✅ Retry delay exponential backoff  
✅ Integration patterns (retry logic, circuit breaker, API response generation)

**Test Coverage:**
- Code range validation
- Classification correctness
- HTTP status mapping (400, 403, 404, 409, 503)
- Exponential backoff calculation
- Jitter implementation (prevents thundering herd)
- Backend integration patterns

#### 7. **Production Documentation** (`xconfess-contracts/CONTRACT_ERROR_CODES.md`)
✅ Complete error registry with 29 documented codes  
✅ Classification rationale for each error  
✅ HTTP status mapping table  
✅ Versioning & backward compatibility guarantees  
✅ Backend integration guide with code examples  
✅ Monitoring & observability recommendations  
✅ FAQ covering common questions

**Documentation Sections:**
- Error Classification System (Terminal vs Retryable)
- Error Code Ranges (stable allocations)
- Detailed tables for each error (code, name, classification, HTTP status)
- Backend integration patterns with code examples
- Versioning strategy and future change process
- Testing instructions
- Monitoring recommendations
- FAQ

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Soroban Smart Contracts                                     │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐  ┌──────────────────────────────┐ │
│ │ Confession-Anchor    │  │ Anonymous-Tipping            │ │
│ ├──────────────────────┤  ├──────────────────────────────┤ │
│ │ ContractError enum   │  │ Error enum (values 1-8)     │ │
│ │ .code() → 1000-5005  │  │ .code() → 6001-6008          │ │
│ │ .classification()    │  │ .classification()            │ │
│ └──────────────────────┘  └──────────────────────────────┘ │
│            ↓                          ↓                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Shared Registry: error.rs                              │ │
│ │ - ErrorClassification enum                             │ │
│ │ - codes module (public constants)                      │ │
│ │ - ERROR_REGISTRY_VERSION = 1                           │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           ↓
          Contract Invocation Failure
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend Error Handler                                       │
├─────────────────────────────────────────────────────────────┤
│ stellar-contract-errors.ts                                  │
│                                                             │
│ classifyContractError(code)                                 │
│   → TERMINAL (400, 403, 404, 409)                          │
│   → RETRYABLE (503, exponential backoff)                    │
│                                                             │
│ getHttpStatusForContractError(code)                         │
│   → HTTP status code for API response                       │
│                                                             │
│ getRetryDelayMs(code, attemptNumber)                        │
│   → Exponential backoff with jitter                         │
│                                                             │
│ getContractErrorMessage(code)                              │
│   → Human-readable description                              │
└─────────────────────────────────────────────────────────────┘
        ↓                    ↓                    ↓
    ┌────────┐         ┌──────────┐        ┌─────────────┐
    │ Retry  │         │ Circuit  │        │ API HTTP    │
    │ Logic  │         │ Breaker  │        │ Response    │
    └────────┘         └──────────┘        └─────────────┘
```

---

## Error Code Allocation

| Range | Contracts | Count | Status |
|-------|-----------|-------|--------|
| 1000–1099 | Anchor (Global) | 7 | Stable |
| 2000–2099 | Anchor (Confession) | 3 | Stable |
| 3000–3099 | Anchor (Reaction) | 2 | Stable |
| 4000–4099 | Anchor (Report) | 3 | Stable |
| 5000–5099 | Anchor (Governance) | 6 | Stable |
| 6000–6099 | Tipping | 8 | Stable |
| 9000–9999 | Reserved | — | Reserved |

**Total Defined:** 29 errors  
**Total Available:** ~900 codes (future-proof)

---

## Classification System

### Terminal Errors (Caller's Responsibility)
- Invalid input, authorization failures, business logic violations
- **HTTP Status:** 400, 403, 404, 409
- **Retry:** None — fix the request and try again
- **Examples:** `INVALID_INPUT`, `UNAUTHORIZED`, `CONFESSION_EXISTS`

### Retryable Errors (Transient State)
- Pause, rate limit, cooldown, overflow
- **HTTP Status:** 503 Service Unavailable
- **Retry:** Yes — use exponential backoff
- **Examples:** `COOLDOWN_ACTIVE`, `RATE_LIMITED`, `CONTRACT_PAUSED`

---

## Backward Compatibility

✅ **No Breaking Changes**
- Existing error codes retain their values
- Existing contract interfaces unchanged
- Anchor contract errors re-exported from shared registry
- Tipping contract codes mapped (not reassigned)

✅ **Version 1 Stability**
- `ERROR_REGISTRY_VERSION = 1` guards against accidental mismatches
- Tests pin version and alert if changed
- Consumers can validate they support the version

✅ **Future Extension**
- Adding new errors is safe (use unused codes in range)
- Modification or removal of existing errors requires version bump
- Version bump signals breaking change to all consumers

---

## Integration Examples

### Retry Logic
```typescript
async function invokeWithRetry(method, args) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await contract[method](...args);
    } catch (error) {
      const code = extractErrorCode(error);
      if (!isRetryableContractError(code)) throw error;
      
      await sleep(getRetryDelayMs(code, attempt));
    }
  }
}
```

### API Response
```typescript
catch (error) {
  const code = extractErrorCode(error);
  res.status(getHttpStatusForContractError(code)).json({
    error: getContractErrorMessage(code),
    code,
    retryable: isRetryableContractError(code),
  });
}
```

### Circuit Breaker
```typescript
function recordFailure(code) {
  if (isRetryableContractError(code)) {
    this.failures++;
  } else {
    this.isOpen = true;  // Terminal errors open immediately
  }
}
```

---

## Testing Coverage

### Contract Tests (Rust)
- ✅ Error code uniqueness (21 anchor + 8 tipping)
- ✅ Code range boundaries
- ✅ Classification consistency
- ✅ Registry version pinning
- ✅ Message non-emptiness
- ✅ Backend compatibility fixtures

### Backend Tests (TypeScript)
- ✅ Code constant validation
- ✅ Classification accuracy (Terminal/Retryable)
- ✅ HTTP status mapping
- ✅ Exponential backoff calculation
- ✅ Jitter distribution
- ✅ Integration patterns (retry, circuit breaker, API response)

### Test Commands
```bash
npm run contract:test      # Rust: cargo test --workspace
npm run backend:test       # TypeScript: jest
npm run ci                 # Full validation suite
```

---

## Files Changed/Created

### Modified
1. `xconfess-contracts/contracts/error.rs` — Enhanced with classification, versioning
2. `xconfess-contracts/contracts/confession-anchor/src/errors.rs` — Re-export from shared
3. `xconfess-contracts/contracts/anonymous-tipping/src/lib.rs` — Add typed error with codes
4. `xconfess-contracts/contracts/anonymous-tipping/src/errors.rs` — Add error codes module
5. `xconfess-contracts/contracts/tests/errors_tests.rs` — Enhanced test coverage

### Created
1. `xconfess-backend/src/stellar/utils/stellar-contract-errors.ts` — Backend handler (278 lines)
2. `xconfess-backend/src/stellar/utils/__tests__/stellar-contract-errors.spec.ts` — 41 tests (418 lines)
3. `xconfess-contracts/CONTRACT_ERROR_CODES.md` — Production documentation (365 lines)

---

## Acceptance Criteria ✅

✅ **Contract failures used by backend consumers map to a stable documented set of meanings.**
- All 29 errors documented in `CONTRACT_ERROR_CODES.md`
- Stable allocation in ranges (1000–6099)
- Versioned registry (`ERROR_REGISTRY_VERSION`)

✅ **Tests pin the mapping so future additions remain backward-aware.**
- Error code uniqueness tests
- Registry version pinning test (fails if accidentally changed)
- Classification consistency tests
- 41 backend integration tests

✅ **Existing backend compatibility fixtures can distinguish retryable from terminal contract failures.**
- `classifyContractError()` function returns Terminal/Retryable/Unknown
- `isRetryableContractError()` helper for quick checks
- Integration test patterns demonstrate retry logic, circuit breaker, API responses

---

## Next Steps for Integration

### 1. **Wire into Backend Error Handling**
```typescript
// In stellar.service.ts, catch handler
import { isRetryableContractError, getHttpStatusForContractError } from './stellar-contract-errors';

try {
  result = await invokeContract(...);
} catch (error) {
  const code = parseContractError(error);
  if (isRetryableContractError(code)) {
    // Implement retry with backoff
  } else {
    // Fail immediately with appropriate HTTP status
  }
}
```

### 2. **Add to Monitoring**
```typescript
logger.info('Contract error', {
  code: errorCode,
  classification: classifyContractError(errorCode),
  service: 'stellar',
});
```

### 3. **Document in API Spec**
Update API documentation to indicate error codes and retry guidance.

### 4. **Add to Changelog**
Document this feature in version release notes.

---

## Verification Checklist

- ✅ All 21 anchor contract errors mapped
- ✅ All 8 tipping contract errors mapped
- ✅ Each error has classification (Terminal/Retryable)
- ✅ Error codes are unique across ranges
- ✅ Documentation complete and comprehensive
- ✅ Tests validate uniqueness, ranges, classifications
- ✅ Backend handler provides retry logic
- ✅ No breaking changes to existing contracts
- ✅ Backward compatible with existing code
- ✅ Version pinning mechanism in place
- ✅ HTTP status mapping defined
- ✅ Exponential backoff implemented with jitter
- ✅ Integration patterns documented

---

## Summary

This implementation delivers a **production-ready error handling system** that:

1. **Unifies** fragmented error definitions across two contracts
2. **Classifies** errors (Terminal/Retryable) for intelligent retry logic
3. **Versions** the registry to prevent breaking changes
4. **Documents** all 29 errors with backend consumption semantics
5. **Tests** comprehensively to pin error codes and behaviors
6. **Integrates** cleanly with backend via helper functions

The system is **immediately usable** for retry logic, circuit breakers, and API error responses. It's **extensible** for future contract versions without breaking existing consumers.

---

**Status:** Ready for production  
**Quality:** Fully tested and documented  
**Impact:** Eliminates brittleness in off-chain error handling
