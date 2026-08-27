# Attaching Logs to Issues and PRs

When reporting bugs or asking for help, logs are invaluable. However, logs often contain sensitive data that must be redacted before sharing.

## What to redact

Always remove or replace the following before pasting logs:

| Type | Example | Replace with |
|------|---------|--------------|
| Auth tokens | `Bearer eyJhbGciOi...` | `Bearer [REDACTED]` |
| API keys | `sk_live_abc123...` | `sk_live_[REDACTED]` |
| Passwords | `password=MySecret123` | `password=[REDACTED]` |
| Private keys | `SABC123...` (Stellar) | `[REDACTED]` |
| JWT tokens | `eyJhbGciOiJIUzI1NiIs...` | `[REDACTED_JWT]` |
| Email addresses | `user@example.com` | `user@[REDACTED]` |
| IP addresses | `192.168.1.100` | `[REDACTED_IP]` |
| Database URIs | `postgres://user:pass@host/db` | `postgres://[REDACTED]` |

## What to keep

Some information is safe and useful for debugging:

- **Request IDs** — these help correlate logs across services
- **Timestamps** — essential for understanding event ordering
- **HTTP methods and paths** — `GET /api/confessions/123` is safe
- **Status codes** — `500 Internal Server Error` is safe
- **Error messages** — generic errors like `ECONNREFUSED` are safe
- **User IDs** — UUIDs like `a1b2c3d4-...` are safe (not personally identifiable)

## How to attach logs

### Short logs (< 20 lines)

Paste directly into the issue or PR comment inside a code block:

````
```
2026-05-30T10:15:23Z [Nest] INFO  [HealthController] GET /api/health/live 200 2ms
2026-05-30T10:15:24Z [Nest] ERROR [ConfessionService] Failed to encrypt: ECONNREFUSED
```
````

### Long logs (> 20 lines)

Attach as a file or use a code block with a collapsible section:

````
<details>
<summary>Full backend logs (click to expand)</summary>

```
[paste redacted logs here]
```

</details>
````

### Screenshots

If the issue is visual (UI bug, layout problem), attach screenshots directly to the GitHub comment. Drag and drop images into the comment box.

## Quick redaction script

If you have raw log output, pipe it through this to auto-redact common patterns:

```bash
cat your-log-file.log | \
  sed 's/Bearer [A-Za-z0-9._-]*/Bearer [REDACTED]/g' | \
  sed 's/sk_live_[A-Za-z0-9]*/sk_live_[REDACTED]/g' | \
  sed 's/[a-f0-9]\{64\}/[REDACTED_HEX]/g' | \
  pbcopy  # copies to clipboard on macOS
```

## Example of a good bug report with logs

```markdown
## Bug: Confession creation fails with 500

**Steps to reproduce:**
1. POST /api/confessions with valid body
2. Returns 500 instead of 201

**Logs:**
```
2026-05-30T10:15:23Z [Nest] ERROR [ConfessionService] create() failed
  Request ID: req_abc123
  Error: ECONNREFUSED 127.0.0.1:5432
  Stack: at TypeORMConnection.connect (...)
```

**Expected:** 201 Created
**Actual:** 500 Internal Server Error
```

This gives maintainers everything they need without exposing secrets.

## Secret Scanning Preflight & Remediation

To prevent accidental secret leaks in pull requests, documentation, sample environment files, or deployment metadata, run the preflight scanner locally before opening or updating a PR:

```bash
./scripts/secret-scanning-preflight.sh
```

Or run via npm:

```bash
npm run secret-scan
```

### Remediation Steps if a Secret is Detected

If the preflight scan or CI check flags a potential secret:

1. **Rotate Credentials Immediately**: If a real private key, API key, JWT, or database password was committed, immediately revoke and rotate the secret at the provider (Stellar wallet, OpenAI, Stripe, AWS, etc.).
2. **Replace with Redacted Placeholders**: Replace the exposed secret in code, docs, or config with standard safe placeholders:
   - Stellar Secret Keys: `STELLAR_SERVER_SECRET=SCXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` or `SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
   - Encryption Keys (64 hex): `CONFESSION_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000`
   - JWT Tokens: `Bearer [REDACTED_JWT]`
   - API Tokens: `sk-proj-[REDACTED]`
   - Private Key Blocks: `[REDACTED_PRIVATE_KEY]`
3. **Purge from Git History**: If the secret was committed to a git branch, scrub it from git history before pushing (e.g. using `git filter-repo` or `git rebase`).
4. **Re-test**: Verify that the preflight scan passes cleanly:
   ```bash
   ./scripts/secret-scanning-preflight.sh --self-test
   ./scripts/secret-scanning-preflight.sh
   ```

