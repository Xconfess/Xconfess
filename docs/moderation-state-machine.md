# Moderation State Machine

Admin reference for content moderation transitions.

## States

| State | Meaning |
|---|---|
| `pending` | Awaiting initial review |
| `approved` | Passes moderation; visible to users |
| `flagged` | Suspicious; needs human review |
| `escalated` | Referred to senior moderators |
| `resolved` | Handled by a moderator |
| `hidden` | Removed from public view |
| `rejected` | Permanently denied |

## Allowed Transitions

| From | To | Trigger / Side Effect |
|---|---|---|
| `pending` | `approved` | Auto-approval or manual review — content becomes visible |
| `pending` | `flagged` | AI score above medium threshold — queued for review |
| `pending` | `rejected` | AI score above high threshold or manual reject |
| `approved` | `flagged` | Post-approval report or delayed AI flag |
| `flagged` | `escalated` | Moderator escalates to senior review |
| `flagged` | `resolved` | Moderator dismisses the flag |
| `flagged` | `hidden` | Moderator removes content |
| `flagged` | `rejected` | Moderator rejects content |
| `escalated` | `resolved` | Senior moderator clears the flag |
| `escalated` | `hidden` | Senior moderator removes content |
| `escalated` | `rejected` | Senior moderator rejects content |
| `resolved` | `flagged` | Re-flagged if new reports arrive |
| `hidden` | `resolved` | Content restored after review |
| `rejected` | `pending` | Appeal or manual requeue for re-review |

Self-transitions (`X → X`) are always rejected.

## Side Effects

- **Audit log** — every transition is recorded via `ModerationLog`
- **Notifications** — users are notified on `approved`, `rejected`, and `hidden` transitions
- **Event emitter** — `moderation.status.changed` event fired on every valid transition

## Code References

- State machine logic: `src/moderation/moderation-state-machine.ts`
- State machine tests: `src/moderation/moderation-state-machine.spec.ts`
- AI moderation service: `src/moderation/ai-moderation.service.ts`
- Moderation controller: `src/moderation/moderation.controller.ts`
- Moderation log entity: `src/moderation/entities/moderation-log.entity.ts`

## Audit Log Retention (#2023)

Every moderation state transition is recorded as an `AuditLog` row
(`action: moderation_state_transition`) via `AuditLogService.logModerationStateTransition`,
written in the same DB transaction as the state change itself (see
`ModerationRepositoryService.transitionState`). The entry records the actor,
the previous and next state, the moderation log ID as target, a reason, and
a timestamp. It never stores confession or private-message bodies â€”
only the confession's ID (`confessionId`), matching the pattern already
used by `logReportResolved` and `logConfessionDelete`.

**Current status: no automated retention job exists yet for the `audit_logs`
table.** Other subsystems in this repo already have one â€” see
`EXPORT_RETENTION_DAYS` / `data-export-cleanup.ts` for exports and
`DLQ_RETENTION_DAYS` for the notification dead-letter queue â€” and a future
audit-log cleanup job should follow the same shape:

- A configurable `AUDIT_LOG_RETENTION_DAYS` env var (suggested default: 365
  days, matching `ANALYTICS_RETENTION_DAYS`, since audit trails are typically
  needed longer than operational data).
- A scheduled job that deletes (or archives) `audit_logs` rows older than the
  cutoff, following the batching pattern in `data-export-cleanup.ts`.
- The cleanup run itself should be audited, the same way
  `logExportRetentionCleanup` records its own dry-run/real cleanup summary.

Until that job exists, `audit_logs` grows unbounded. This is a known gap,
not a silent omission â€” flagging it here so it's tracked rather than
rediscovered later.
