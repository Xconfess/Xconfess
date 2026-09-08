# Production Readiness Scorecard

Xconfess uses one command as the reviewer-facing readiness gate:

```bash
npm run readiness
```

That command delegates to `npm run production:readiness`, runs the focused
backend/frontend/Stellar/privacy checks, and writes generated local reports to
`readiness-results/`:

- `production-readiness-scorecard.json`
- `production-readiness-scorecard.md`

The generated JSON is schema-versioned and machine-readable:

```json
{
  "schemaVersion": 1,
  "generatedAt": "ISO_DATE",
  "startedAt": "ISO_DATE",
  "mode": "local",
  "status": "passed",
  "durationMs": 1,
  "checks": [
    {
      "name": "backend build",
      "status": "PASS",
      "exitCode": 0
    }
  ]
}
```

Use deployed mode before campaign review windows:

```bash
npm run production:readiness:deployed
```

Deployed mode adds deploy preflight and the public smoke test. It must only run
against configured staging or production URLs and must not submit mainnet
transactions in CI.
