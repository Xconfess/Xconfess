# Application log field privacy

Issue #2282. Application logs must not capture confession, message, comment or
search text, tokens, or secrets, not even by accident.

## How it is enforced

| Layer | File | Covers |
| --- | --- | --- |
| App logger | `xconfess-backend/src/common/logging/redacting-console.logger.ts`, installed in `src/main.ts` | Every `new Logger(...)` call and `AppLogger` (which delegates to Nest's `Logger`) |
| Shared rules | `xconfess-backend/src/common/logging/log-redaction.ts` | Used by the app logger and the HTTP `StructuredLoggingInterceptor` |

Redaction runs on the message and every extra argument, at any depth, including
arrays and `Error` objects. A trailing logger context name (e.g.
`ConfessionService`) is kept as-is. **Fails safe:** if redaction throws, the
line `[log redaction failed]` is logged instead of the original value.

## Allowed fields

These fields are logged verbatim, but only when their value is a primitive
(string, number, boolean). If one of them holds an object or array, it is
redacted recursively like any other field, so `message: { body }` cannot
smuggle content. Tokens embedded in their string values are still removed.

`requestId`, `correlationId`, `timestamp`, `statusCode`, `status`, `method`,
`route`, `path`, `duration`, `durationMs`, `subsystem`, `errorClass`, `code`,
`message`, `level`, `event`, `severity`, `userId`, `userRole`, `action`,
`entityType`, `entityId`

Other fields pass through the rules below.

## Redacted

| What | Rule | Output |
| --- | --- | --- |
| User-generated text | Field named `content`, `body`, `text`, `plaintext`, `decryptedContent`, `confessionContent`, `messageContent`, `commentContent`, `replyContent`, `confessionText`, `messageText`, `commentText`, `rawTerm`, `searchTerm` (case-insensitive) | `[REDACTED:user-content,len=<n>]` |
| Tokens / secrets by name | `password`, `secret`, `token`, `*Token`, `apiKey`, `authorization`, `cookie`, `credential`, `encrypt*`, `cipher*`, `seedPhrase`, … | `[REDACTED]` |
| Tokens inside text | `Bearer <token>` / `Basic <token>`, JWTs anywhere in a string, `token=`, `access_token=`, `refresh_token=`, `reset_token=`, `api_key=`, `code=` query parameters | `Bearer [REDACTED]`, `[REDACTED]`, `token=[REDACTED]` |
| Token-shaped values | Whole-value JWTs, long hex (≥ 40 chars), long base64 | `[REDACTED]` / `abcd...REDACTED` |

## Review checklist

Use this checklist when reviewing any PR that adds or changes a log call.

- [ ] The log carries IDs (`confessionId`, `messageId`, `requestId`), not entities. Never log a whole DTO, entity or request body.
- [ ] No user-generated text is interpolated into the message string. Redaction works on field names, so `` `failed for ${dto.content}` `` cannot be caught.
- [ ] User text that must be described is logged by shape only (length, word count), like `logSlowSearch`.
- [ ] Any new field holding user text uses a name in the user-generated text list, or is added to `USER_CONTENT_FIELDS` with a test.
- [ ] No tokens, cookies, headers, or secrets are logged. If a header must be logged, log its presence (`hasAuthorization: true`), not its value.
- [ ] Error messages built from user input do not echo that input.
- [ ] New allowed fields hold operational data only, and are added to `LOG_ALLOWED_FIELDS` with a reason in the PR.
- [ ] The log has a test that asserts the private value does **not** appear in output (see `redacting-console.logger.spec.ts`).

## Tests

- `xconfess-backend/src/common/logging/redacting-console.logger.spec.ts`: representative service log shapes (confession, message, comment, auth, error/stack, Stellar), allowed fields, fail-safe path, circular payloads
- `xconfess-backend/src/common/logging/log-redaction.spec.ts`: field-level rules
