# Contract Error Codes: Quick Reference for Developers

## TL;DR

✅ All contract errors now have stable, documented numeric codes  
✅ Backend can distinguish retryable from terminal failures  
✅ Zero breaking changes — fully backward compatible  

## Using Contract Errors in Backend

### 1. Check if Error is Retryable

```typescript
import { isRetryableContractError } from '@stellar/utils/stellar-contract-errors';

if (isRetryableContractError(errorCode)) {
  // Retry with exponential backoff
  await retryWithBackoff(() => invokeContract(...));
} else {
  // Fail immediately
  throw new BadRequestException('Invalid input');
}
```

### 2. Get HTTP Status Code

```typescript
import { getHttpStatusForContractError } from '@stellar/utils/stellar-contract-errors';

const status = getHttpStatusForContractError(errorCode);
res.status(status).json({ error: 'Failed' });

// Retryable errors → 503
// Authorization errors → 403
// Not found → 404
// Conflicts → 409
// Other terminal → 400
```

### 3. Calculate Retry Delay

```typescript
import { getRetryDelayMs } from '@stellar/utils/stellar-contract-errors';

const delayMs = getRetryDelayMs(errorCode, attemptNumber);
// Exponential backoff with jitter automatically applied
await sleep(delayMs);
```

### 4. Get Error Message

```typescript
import { getContractErrorMessage } from '@stellar/utils/stellar-contract-errors';

const message = getContractErrorMessage(errorCode);
// "Unauthorized" or "Rate Limited" etc.
```

## Common Error Codes

| Code | Name | Retryable? | HTTP Status | When |
|------|------|-----------|------------|------|
| 1000 | UNAUTHORIZED | ❌ | 403 | User not authorized |
| 1002 | INVALID_INPUT | ❌ | 400 | Invalid data |
| 1003 | OVERFLOW | ✅ | 503 | Math overflow, retry later |
| 1004 | COOLDOWN_ACTIVE | ✅ | 503 | Must wait, retry later |
| 2000 | CONFESSION_EXISTS | ❌ | 409 | Already created |
| 6001 | INVALID_TIP_AMOUNT | ❌ | 400 | Tip ≤ 0 |
| 6006 | CONTRACT_PAUSED | ✅ | 503 | Paused, will resume |
| 6007 | RATE_LIMITED | ✅ | 503 | Too many tips, retry later |

**Full list:** See `CONTRACT_ERROR_CODES.md`

## Integration Examples

### Retry Pattern
```typescript
async function invokeWithRetry(contract, method, args, maxAttempts = 3) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await contract[method](...args);
    } catch (error) {
      const code = extractErrorCode(error);
      if (!isRetryableContractError(code)) throw error;
      if (attempt < maxAttempts - 1) {
        await sleep(getRetryDelayMs(code, attempt));
      }
    }
  }
}
```

### Circuit Breaker Pattern
```typescript
const breaker = {
  failures: 0,
  threshold: 5,
  isOpen: false,
  recordFailure(code) {
    if (isRetryableContractError(code)) {
      this.failures++;
    } else {
      this.isOpen = true; // Terminal errors open immediately
    }
    if (this.failures >= this.threshold) this.isOpen = true;
  }
};
```

### API Error Response
```typescript
try {
  result = await stellarService.invokeContract(...);
  res.json(result);
} catch (error) {
  const code = extractErrorCode(error);
  res.status(getHttpStatusForContractError(code)).json({
    error: getContractErrorMessage(code),
    code,
    retryable: isRetryableContractError(code),
  });
}
```

## Adding New Errors (Future)

1. Choose unused code in appropriate range (see `CONTRACT_ERROR_CODES.md`)
2. Add to contract error enum
3. Map in `.code()` method
4. Add classification in `.classification()` method
5. Update tests
6. Document in `CONTRACT_ERROR_CODES.md`

**Do NOT change existing error codes** — they're part of the public interface!

## Version Info

- **ERROR_REGISTRY_VERSION:** 1 (stable)
- **Last Updated:** 2026-04-24
- **Status:** Production Ready

## Questions?

- See full docs: `CONTRACT_ERROR_CODES.md`
- Check implementation: `stellar-contract-errors.ts`
- Run tests: `npm run backend:test`
