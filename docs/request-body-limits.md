# Request body size limits

The backend disables Nest's built-in body parser and applies explicit limits in
`xconfess-backend/src/common/request-body-limits.ts` before validation pipes or
controllers run.

| Route(s) | JSON / urlencoded limit |
|---|---|
| `POST /confessions`, `PUT /confessions/:id` | 16 KiB |
| `POST /confessions/:id/comments`, `PATCH /confessions/:id/comments/:commentId` | 16 KiB |
| `POST /confessions/:id/report` | 16 KiB |
| `POST /confessions/drafts`, `PATCH /confessions/drafts/:id` | 16 KiB |
| `POST /messages` (and key registration) | 32 KiB |
| Every other route (public or authenticated) | 100 KiB |

Oversized bodies get a `413` with the standard error envelope (`status`, `code`,
`message`, `timestamp`, `path`, `requestId`). The rejected body is never echoed
back.

Multipart (file upload) requests are not parsed by these parsers. Attachment
size limits are configured separately in the upload handlers.
