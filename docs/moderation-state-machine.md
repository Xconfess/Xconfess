# Report and Moderation States

The API stores report workflow status separately from content moderation status.
Both sets use lowercase values in API responses.

## Reports

| State | Meaning |
|---|---|
| `pending` | Newly submitted report; the default state. |
| `reviewing` | Report marked as under review. The status is supported for filtering; the guarded admin actions do not assign it. |
| `resolved` | Report handled by a moderator. This records the report outcome; any action on the confession is separate. |
| `dismissed` | Report closed without action. |

New reports start at `pending`. The guarded admin endpoints can resolve or
dismiss any report that is not already in the requested state, so `resolved`
and `dismissed` can be changed to one another. Bulk resolve processes only
`pending` reports and skips the others. There is no guarded transition into
`reviewing`. The legacy unguarded `PATCH /api/reports/:id` directly writes the
submitted status without applying a transition graph or runtime DTO validation.

## Content moderation

| State | Meaning |
|---|---|
| `pending` | Awaiting a decision or manual review. |
| `approved` | Passed moderation. |
| `flagged` | Needs human review. |
| `escalated` | Referred for further review. |
| `resolved` | Review closed without hiding or rejecting the content. |
| `hidden` | Content is hidden from public view. |
| `rejected` | Content was rejected. |

When automatic action is enabled, the moderation service assigns `rejected` at
or above the high score threshold, `flagged` at or above the medium threshold,
and `approved` below it. With automatic action disabled, it assigns `pending`.

The validated state-machine endpoint allows these transitions:

| From | Allowed next states |
|---|---|
| `pending` | `approved`, `flagged`, `rejected` |
| `approved` | `flagged` |
| `flagged` | `escalated`, `resolved`, `hidden`, `rejected` |
| `escalated` | `resolved`, `hidden`, `rejected` |
| `resolved` | `flagged` |
| `hidden` | `resolved` |
| `rejected` | `pending` |

Self-transitions and all omitted transitions are rejected by
`PATCH /api/admin/moderation/:id/transition` with `400 Bad Request`. A reason
of at least three characters is required.

## Moderator-only actions and implementation notes

Admin routes require a valid JWT and the `admin` role. This includes report
listing, resolving, dismissing, bulk resolving, and the moderation queue and
transition routes. The validated content transition endpoint sends the
moderator, review time, reason, and state change to the audit logger. A
transition can still succeed if the audit-log write fails.

Two older controller paths do not enforce the same workflow: the legacy
`POST /api/admin/moderation/review/:id` passes `dto.status` to a direct status
update without checking the transition table, and its DTO lacks validation
decorators; the legacy `/api/reports` list/update controller has no
authentication or role guard. Use the guarded `/api/admin` routes for moderator
actions. The legacy `review` endpoint does not write the transition audit entry.

The AI moderation webhook is authenticated with its configured HMAC secret. It
can synchronize moderation statuses and emits high-severity or review-required
events; those automated updates do not use the moderator transition endpoint.

## Code references

- Report states and entity: [report.entity.ts](../xconfess-backend/src/admin/entities/report.entity.ts)
- Guarded report actions: [admin.controller.ts](../xconfess-backend/src/admin/admin.controller.ts)
- Moderation states and score thresholds: [ai-moderation.service.ts](../xconfess-backend/src/moderation/ai-moderation.service.ts)
- Allowed transition graph: [moderation-state-machine.ts](../xconfess-backend/src/moderation/moderation-state-machine.ts)
- Validated transition persistence: [moderation-repository.service.ts](../xconfess-backend/src/moderation/moderation-repository.service.ts)
- Admin moderation routes: [moderation.controller.ts](../xconfess-backend/src/moderation/moderation.controller.ts)
- Legacy unguarded report routes: [report.controller.ts](../xconfess-backend/src/report/report.controller.ts)

The audit-log service has no automated retention job in the current backend;
`audit_logs` rows therefore have no application-managed expiry.
