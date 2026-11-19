# Notification preferences: scope labels

Every notification-type toggle in the preferences screen now carries a
visible scope badge (#2310), so users can tell what each preference
controls on the backend and which messages still arrive even when the
toggle is off.

## Scopes

| Scope | Shown next to | Security-critical |
| --- | --- | --- |
| Content activity | Reactions, Comments | No |
| Social activity | Mentions, Follows | No |
| Financial activity | Tips | No |
| Achievements | Badges | No |
| Security | (never user-togglable) | **Yes** |

The security scope is deliberately not exposed as a toggle: silencing
sign-in, device-change and password-reset notifications would hide
account takeover. The preferences header makes this explicit, and any
future toggle marked `scope: "security"` renders with a red `ShieldAlert`
badge and the matching help copy.

## Label ↔ backend mapping

Each entry names the backend job it controls:

| UI toggle | Backend job key | Fires when |
| --- | --- | --- |
| Reactions | `reaction` | Another user adds or removes a reaction on your confession. |
| Comments | `comment` | Another user comments on your confession or replies in a thread you started. |
| Tips | `tip` | A tip hits your account. |
| Badges | `badge` | A new badge is earned or a milestone reached. |
| Mentions | `mention` | Another user names your handle in a confession or comment. |
| Follows | `follow` | A user starts following your profile. |

The two delivery channels (push, email) also carry explicit scope notes:
push requires browser permission and reaches signed-in sessions only;
email is sent to the address on the account and continues to deliver
security alerts even when the toggle is off.

## Failure safety

- The UI never discloses other users' content; it only names the kind of
  event that would trigger a notification.
- A failed save surfaces the toast from `useGlobalToast`; no API error
  details are printed in the page.

## Files

- `xconfess-frontend/app/components/notifications/NotificationPreference.tsx`
- `xconfess-frontend/app/components/notifications/__tests__/NotificationPreference.test.tsx`
  — verifies the scope badges, the security-critical note, the
  `data-notification-scope` attribute and the updated descriptions.
