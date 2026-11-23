# Request body limits

The API rejects oversized JSON and URL-encoded request bodies with HTTP `413`
and the stable error code `REQUEST_TOO_LARGE`. The response keeps the normal
error envelope and includes the request ID, but never includes parser or SQL
details.

| Request family                   | Maximum body |
| -------------------------------- | -----------: |
| Confession create/update         |       16 KiB |
| Comment create/update            |       16 KiB |
| Report actions                   |       16 KiB |
| Confession drafts                |       16 KiB |
| Messages and key registration    |       32 KiB |
| Other JSON or URL-encoded routes |      100 KiB |

Attachments are the intentional exception to the JSON parser limits. Uploads
use the attachment validation path and are limited by `ATTACHMENT_MAX_SIZE_BYTES`
(10 MiB by default), plus the configured MIME-type allowlist. This keeps binary
uploads from bypassing validation while allowing them to be larger than normal
API JSON envelopes.

The limits are enforced before controller validation or application logic. The
boundary behavior is covered by `src/common/request-body-limits.spec.ts`; run
the backend tests with:

```bash
npm test -- --runInBand src/common/request-body-limits.spec.ts
```
