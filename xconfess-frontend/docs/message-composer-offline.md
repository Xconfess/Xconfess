# Message composer: offline and reconnect feedback

The inbox message composer
(`app/components/messages/MessageComposer.tsx`) explains to the user when a
send cannot be attempted because the client has lost connectivity, and
confirms when the connection comes back. This document records the
public contract and how the pieces fit together.

## Public behaviour

### Props

| Prop | Default | Meaning |
| --- | --- | --- |
| `isOffline` | `false` | When `true`, the device (or the app's connection to the backend) is offline. The composer refuses to fire `onSend`, disables the text field and the send button, and shows a polite status explaining that the draft is safe. |

All other props keep their existing contract. The composer stays purely
presentational: it never performs network I/O and never decides when a send
has succeeded.

### Visible states

The composer shows **one** status row below the input at a time, in this
priority:

1. **Offline** (`isOffline === true`) — `WifiOff` icon, warning colour. Copy:
   _"Offline — your message can't be sent right now. The draft is saved and
   will be here when you reconnect."_
2. **Reconnected** — briefly shown (3 s) after `isOffline` transitions from
   `true` to `false`. `Wifi` icon, success colour. Copy: _"Back online. You
   can send your message now."_
3. **Draft saved** — the pre-existing "Draft saved for this conversation."
   line, shown while `hasDraft` is true and the composer is not offline or
   showing the reconnect confirmation.

All three use `role="status"` with `aria-live="polite"` so screen readers
announce the transition without interrupting the user's current activity.

### Preventing false success

- While `isOffline` is `true`, the Enter key handler is a no-op and the send
  button is disabled. `onSend` is never called, so the caller cannot fire a
  network request it will later have to roll back or retry blindly.
- The composer keeps the full draft text intact across the offline
  transition (verified by test); the existing draft-persistence flow
  (`useConversationDrafts`) is untouched.

## Reconnect and retry safety

The composer does **not** auto-retry. When connectivity returns the user
clicks send (or presses Enter) again, which is one explicit user intent =
one network request.

To make a manual retry safe on the server side, the caller must send an
idempotency key with the request:

- **Where it lives**: `app/(dashboard)/messages/page.tsx` keeps a per-thread
  `pendingIdempotencyKeys` ref. The first send attempt for a draft
  generates a UUID (`crypto.randomUUID()` with a `Date.now()+random`
  fallback) and caches it under the thread key.
- **Header**: the key is sent to the backend as `Idempotency-Key` on
  `POST /messages`. The NestJS controller reads it in
  `xconfess-backend/src/messages/messages.controller.ts` and the service
  stores a hash of `(userId, idempotencyKey)` to dedupe repeated creates
  (see `20261022000001-add-message-idempotency-key.ts`).
- **Lifecycle**: the cached key is dropped on a successful send and on
  explicit draft discard. The next message in the conversation gets a fresh
  key. A failed send keeps the key, so a user retry (same draft, new click)
  reuses it and the backend collapses duplicates.

Thread replies (`POST /messages/reply`) do not currently accept an
`Idempotency-Key` header server-side; the composer still blocks sends while
offline for replies, and repeated-reply protection on that endpoint is
tracked separately.

## Connectivity source

The page reads `isOnline` from `useNetwork()` in
`app/lib/providers/NetworkStatusProvider.tsx` and passes
`isOffline={!isOnline}` to every `MessageComposer`. That provider is mounted
in the root layout and already listens to `online` / `offline` window events
plus the browser Network Information API, so no new listeners are added by
this change.

If the composer is used outside the messages page (or inside a tree that
has no `NetworkStatusProvider`), `isOffline` simply defaults to `false` —
the composer behaves exactly as it did before this change.

## Failure handling

- Lost connectivity is surfaced in-place as a status row; it does not
  trigger a toast or expose the underlying error. No secrets, draft
  content, or server responses are printed to the user beyond the generic
  "draft is saved" wording.
- If `handleSendMessage` is somehow reached while `!isOnline` (for example
  during the race between an in-flight disconnect event and a send click)
  it exits before any `apiClient.post` call, so no partially-encrypted
  request leaves the device.

## Tests

Behaviour is covered by
`app/components/messages/__tests__/MessageComposer.test.tsx`:

- `MessageComposer — offline feedback`: status message, disabled controls,
  blocked Enter / click, draft preservation across the offline transition,
  status cleared after reconnect.
- `MessageComposer — reconnect flow`: confirmation appears after the
  transition, dismisses after ~3 s, sending is re-enabled, and the
  confirmation does not appear on the first online render.
