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
