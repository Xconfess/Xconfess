# Contributor Guide: Redacting Logs Safely

When sharing error logs, stack traces, or debugging output in issues or pull requests, always redact sensitive information. This guide shows what to redact and how.

## What to Redact

### Always Redact
- **API keys and tokens** (JWT, OAuth, private keys)
- **Database credentials** (passwords, connection strings)
- **User emails and phone numbers**
- **Private keys** (PEM files, seed phrases)
- **Session IDs and cookies** (sensitive auth tokens)
- **Credit card or payment information**
- **Private user data** (real names, addresses, IDs)

### Safe to Keep
- **Request IDs** (useful for tracing logs)
- **Timestamps** (help correlate events)
- **Error types and messages** (error class names, message text)
- **Stack trace function names** (don't contain sensitive data)
- **Port numbers** (5000, 3000, 55432 are fine)
- **Localhost references** (http://localhost:5000 is fine)
- **Generic line numbers** (line 42, column 10 are fine)

## Examples

### Example 1: Authentication Error

```
❌ BAD - Contains email and token:
Error: Authentication failed for user@xconfess.com
  at verifyToken (auth.ts:42)
  at middleware (jwt.ts:18)
Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.[UNREDACTED_TOKEN_EXPOSED]

✓ GOOD - Token and email redacted:
Error: Authentication failed for [USER_EMAIL]
  at verifyToken (auth.ts:42)
  at middleware (jwt.ts:18)
Token: [REDACTED_JWT_TOKEN]
```

### Example 2: Database Connection Error

```
❌ BAD - Contains credentials:
Error: connect ECONNREFUSED 127.0.0.1:55432
PostgreSQL connection failed
User: admin
Password: SuperSecret123!
Connection string: postgresql://admin:SuperSecret123!@localhost:55432/xconfess_dev

✓ GOOD - Credentials redacted:
Error: connect ECONNREFUSED 127.0.0.1:55432
PostgreSQL connection failed
Connection string: postgresql://[REDACTED_USER]:[REDACTED_PASS]@localhost:55432/xconfess_dev
```

### Example 3: API Response with User Data

```
❌ BAD - Contains user information:
Response from GET /api/confessions
{
  "id": "c123abc",
  "userId": "user_550e8400e29b41d4a716446655440000",
  "content": "My confession...",
  "authorEmail": "john.doe@company.com",
  "ipAddress": "192.168.1.100",
  "timestamp": "2026-05-30T18:43:15Z"
}

✓ GOOD - PII redacted, request ID kept:
Response from GET /api/confessions (request_id: req_abc123)
{
  "id": "c123abc",
  "userId": "[REDACTED_USER_ID]",
  "content": "My confession...",
  "authorEmail": "[REDACTED_EMAIL]",
  "ipAddress": "[REDACTED_IP]",
  "timestamp": "2026-05-30T18:43:15Z"
}
```

### Example 4: Environment Variables

```
❌ BAD - Contains all secrets:
.env file:
DATABASE_URL=postgresql://admin:mypassword@localhost:55432/xconfess_dev
REDIS_URL=redis://:secretpass@localhost:6379
JWT_SECRET=my_super_secret_key_12345
STELLAR_SECRET_KEY=SBQJ5QKXO3ZYTR3QYVB2ORMZPYVVV...

✓ GOOD - Secrets redacted, URLs kept:
.env file (redacted):
DATABASE_URL=postgresql://[REDACTED]@localhost:55432/xconfess_dev
REDIS_URL=redis://[REDACTED]@localhost:6379
JWT_SECRET=[REDACTED]
STELLAR_SECRET_KEY=[REDACTED]
```

### Example 5: Error Stack Trace

```
❌ BAD - Contains JWT in error details:
Error: Failed to process payment
  at processPayment (payments.ts:123)
  at handleCheckout (checkout.ts:456)
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

✓ GOOD - Token redacted, function names kept:
Error: Failed to process payment
  at processPayment (payments.ts:123)
  at handleCheckout (checkout.ts:456)
  Authorization: Bearer [REDACTED_TOKEN]
```

## Quick Checklist

Before posting logs in an issue or PR, verify:
- [ ] No API keys, tokens, or JWTs are visible
- [ ] No database passwords or connection strings with credentials
- [ ] No user emails, phone numbers, or personal data
- [ ] No private keys or seed phrases
- [ ] No session IDs or sensitive cookies
- [ ] Request IDs, timestamps, and error messages are kept for context

## Redaction Format

Use a consistent redaction format for clarity:
- `[REDACTED]` — for single values
- `[REDACTED_TOKEN]` — for specific types
- `[REDACTED_EMAIL]` — for specific types
- `[REDACTED_PASSWORD]` — for specific types

Or use markers that are clearly placeholder text:
- `***` (simple placeholder)
- `XXXXXX` (for shorter values)

Pick one style and use it consistently throughout your log snippet.

## Still Unsure?

When in doubt, redact it. It's better to redact too much than to leak sensitive information. If you're not sure whether something is sensitive, ask in the issue or PR comments.
