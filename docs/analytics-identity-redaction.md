# Analytics identity redaction

Issue #2281. Generated identity identifiers (anonymous user IDs, anonymous
context IDs, registered user IDs, session/device IDs, wallet addresses) are kept
out of analytics storage and third-party telemetry by default.

## Sinks

| Sink | Where | Third party? | Protection |
| --- | --- | --- | --- |
| `analytics_events` table | `xconfess-backend/src/analytics/analytics-event.service.ts` | No (first-party DB; feeds aggregate-only public traction) | `actorId` is replaced with a keyed one-way pseudonym; identity keys in payloads are rejected |
| Error beacon (`NEXT_PUBLIC_ERROR_TRACKING_URL`) | `xconfess-frontend/app/lib/utils/errorHandler.ts` (`logError`) | **Yes** | Payload passes through `redactTelemetryPayload` before `sendBeacon` |

No other analytics or telemetry SDK (GA, PostHog, Segment, Mixpanel, etc.) is
bundled. Any new sink must go through one of the two helpers below.

## Backend event inventory

All events go through `AnalyticsEventService.record`. Event names are
allowlisted in `entities/analytics-event.entity.ts`.

| Event | Emitted from | Actor passed in | Stored actor | Metadata kept |
| --- | --- | --- | --- | --- |
| `user_registered` | `user/user.service.ts` | `user:<userId>` | `user:p1_<hash>` | `source`, `requestId` |
| `user_login` | `auth/auth.service.ts` | `user:<userId>` | `user:p1_<hash>` | `source` |
| `confession_created` | `confession/confession.service.ts` | `anon:<anonymousUserId>` | `anon:p1_<hash>` | `source`, `confessionId` |
| `comment_created` | `comment/comment.service.ts` | `anon:<anonymousUserId>` | `anon:p1_<hash>` | `source`, `commentId`, `confessionId` |
| `reaction_created` | `reaction/reaction.service.ts` | `anon:<anonymousUserId>` | `anon:p1_<hash>` | `source`, `reactionId`, `confessionId` |
| `message_sent` | `messages/messages.service.ts` | `anon:<senderAnonymousUserId>` | `anon:p1_<hash>` | `source`, `messageId`, `confessionId` |
| `tip_completed` | `tipping/tipping.service.ts`, `tipping/chain-reconciliation.service.ts` | none | `null` | `source`, `tipId`, `confessionId`, `requestId` |
| `stellar_tx_confirmed` | `tipping/tipping.service.ts`, `tipping/chain-reconciliation.service.ts` | none | `null` | `source`, `requestId` |
| `stellar_tx_failed` | `tipping/tipping.service.ts` | none | `null` | `source`, `state`, `requestId` |
| `soroban_event_indexed` | `stellar/soroban-event-checkpoint.service.ts` | none | `null` | `source`, `state` |
| `wallet_connected`, `stellar_tx_submitted`, `confession_publish_failed` | allowlisted, not currently emitted | — | — | — |

### How the pseudonym works

`src/analytics/analytics-identity.ts`:

- `pseudonym = <namespace>:p1_<first 32 hex of HMAC-SHA256(key, namespace + "\0" + id)>`
- The key comes from `ANALYTICS_ACTOR_PSEUDONYM_SECRET`, or if that is unset,
  from a domain-separated derivation of `JWT_SECRET`.
- It is deterministic, so DAU/WAU/MAU and retention cohorts still count distinct
  actors. Without the key it cannot be reversed or joined to `users` or
  `anonymous_users`.
- **Fails safe:** if no key is available, the actor is dropped (`null`) and a
  single warning is logged. The event itself is still recorded.
- Payload keys that name identity identifiers (`anonymousUserId`,
  `anonymousContextId`, `userId`, `sessionId`, `deviceId`, `walletAddress`,
  `publicKey`, ...) are rejected with an error. The error names the key, never
  the value. Actors must go through `actorId`.

### Key rotation

Changing `ANALYTICS_ACTOR_PSEUDONYM_SECRET` (or `JWT_SECRET` when no dedicated
secret is set) starts a new pseudonym space. Distinct-actor counts and retention
cohorts that span the rotation will count one actor twice. Set a dedicated
secret so a JWT rotation does not cause this.

## Frontend telemetry

`app/lib/utils/telemetryRedaction.ts` redacts the following before the error
beacon is sent:

- object keys naming identity values: anonymous/user/actor/session/device IDs,
  wallet addresses, public keys, email, authorization, token, password, cookie
- query parameters with those names
- path segments under `/messages/keys/` (always), and under `/users/`,
  `/anonymous[-users]/`, `/sessions/`, `/wallets/` when the segment looks like
  an ID (UUID, number, or a token of 16+ characters)
- `anon:<id>` / `user:<id>` strings

If redaction throws, the beacon is not sent.

## Explicitly justified exclusions (kept)

| Field | Why it is kept |
| --- | --- |
| `confessionId`, `commentId`, `reactionId`, `messageId`, `tipId` | Content or record IDs, not identities. Confession and comment IDs are already public in URLs. They are needed for idempotency and debugging. |
| `requestId`, `correlationId` | Random per request, not tied to an identity. Needed to match a report with server logs. |
| `txHash`, `contractId`, `network`, `assetCode`, `amountAtomic` | Public on-chain data. Needed for tip reconciliation and idempotency. They identify transactions, not app identities. |
| Pseudonymous `actorId` | Needed for distinct-actor aggregates. It is a keyed hash, not the raw ID. |

## Tests

- `xconfess-backend/src/analytics/analytics-identity.spec.ts`
- `xconfess-backend/src/analytics/analytics-event.service.spec.ts`: one payload
  test per emitting call site, plus rejection of identity keys
- `xconfess-frontend/app/lib/utils/__tests__/telemetryRedaction.test.ts`:
  includes the full `logError` → `sendBeacon` payload
