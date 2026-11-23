# Data Export Retention & Expiry

Reference for export job lifecycle, download token behaviour, and retention defaults.

## Defaults

| Parameter | Value | Source |
|---|---|---|
| Download TTL | 24 hours after `createdAt` | `app.exportDownloadTtlMs` (fallback: `24 * 60 * 60 * 1000`) |
| Rate limit | 1 per 7 days per user | Hardcoded in `requestExport()` |
| Token cleanup | Runs via `expireStaleDownloadTokens()` | `DATA_EXPORT_TTL_MS` env var |

## Export Statuses

| Status | Meaning |
|---|---|
| `PENDING` | Queued, waiting for background job |
| `PROCESSING` | Job picked up, file being generated |
| `READY` | File available for download |
| `FAILED` | Job failed (retryable) |
| `EXPIRED` | Download window elapsed |

## Download Token Rules

1. A one-time random nonce is generated per `generateSignedDownloadUrl()` call.
2. Only the HMAC-SHA256 hash is stored in `downloadTokenHash`.
3. On first successful download, `downloadTokenHash` is cleared and `downloadedAt` is stamped.
4. Replay attempts (same token, or after `downloadedAt` is set) are rejected.
5. Tokens expire when `createdAt + TTL` elapses, even if never used.

## Redownload Behaviour

| File Available | Token Active | `canRedownload` | `canRequestNewLink` |
|---|---|---|---|
| Yes | Yes | `true` | `false` |
| Yes | No | `false` | `true` |
| No | - | `false` | `false` |

## Code References

- Service: `src/data-export/data-export.service.ts`
- Constants: `src/data-export/data-export.constants.ts`
- Cleanup scheduler: `src/data-export/data-export-cleanup.ts`
- Tests: `src/data-export/data-export.service.spec.ts`
