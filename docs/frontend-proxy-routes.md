# Frontend Proxy Route Inventory

The frontend talks to the backend through Next.js App Router handlers under
`xconfess-frontend/app/api`. Proxy routes should keep browser requests same-origin,
forward cookies or authorization headers when present, and normalize failures through
`createApiErrorResponse`, `proxyError`, or `normalizeApiError`.

## Update checklist

- Run `rg --files xconfess-frontend/app/api | sort` after adding or removing a proxy route.
- Add the new route family below with its backend target and credential behavior.
- Prefer `xconfess-frontend/app/lib/api/errors.ts` for client-side fetch failures and
  `xconfess-frontend/lib/apiErrorHandler.ts` for App Router JSON error responses.

## Route families

| Frontend route family | Backend target | Credentials and notes |
| --- | --- | --- |
| `/api/auth/session` | `/api/auth/session`, with fallback to `/api/auth/me` and login handling | Cookie/session aware; returns normalized auth errors for `AuthProvider`. |
| `/api/users/register` | `/api/users/register` | Validates `BACKEND_API_URL` and uses normalized API error responses. |
| `/api/users/profile`, `/api/users/profile/summary`, `/api/users/privacy-settings`, `/api/users/notification-preferences`, `/api/users/stats` | Matching `/api/users/...` backend routes | Same-origin browser calls; proxy responses should preserve backend status and user-safe messages. Settings pages must surface failures through `normalizeApiError`. |
| `/api/users/[id]/public-profile`, `/api/users/[id]/confessions`, `/api/users/[id]/activities` | Matching `/api/users/:id/...` backend routes | Public/profile data proxies; use centralized API error responses. |
| `/api/confessions`, `/api/confessions/search`, `/api/confessions/[id]` | `/api/confessions...` | Confession list/detail/search proxies; normalize confession payloads where route handlers reshape data. |
| `/api/confessions/[id]/react`, `/report`, `/anchor`, `/tips/stats`, `/tips/verify` | Matching confession action routes | Action routes forward request bodies and preserve backend validation/rate-limit failures. |
| `/api/comments/[confessionId]`, `/api/comments/by-confession/[confessionId]` | `/api/comments...` | Comment proxies should use `buildProxyErrorResponse`/`internalProxyErrorResponse` for backend failures. |
| `/api/notifications`, `/api/notifications/[id]/read`, `/api/notifications/read-all`, `/api/notifications/preference` | Matching `/api/notifications...` routes | Requires authenticated cookies; callers should include credentials on browser fetches. |
| `/api/data-export/request`, `/api/data-export/history`, `/api/data-export/[id]/redownload`, `/api/export/jobs/[userId]` | Matching data-export backend routes | User-owned export flows; preserve backend status for authorization and not-found states. |
| `/api/analytics`, `/api/analytics/trending`, `/api/trending` | `/api/analytics...` and trending endpoints | Some routes reshape dashboard payloads; backend fetch failures must remain normalized JSON. |
| `/api/feature-flags`, `/api/feature-flags/[name]`, `/rollback`, `/check/[name]` | Matching feature-flag backend routes | Admin/protected flows; keep status codes intact for authorization failures. |
| `/api/dm/[userId]` | Direct-message backend route | Authenticated message proxy; never expose backend stack traces. |
| `/api/health/ready` | `/api/health/ready` | Local readiness proxy; useful for frontend diagnostics. |
| `/api/og` | Frontend-only Open Graph image route | Not a backend proxy. |

## Error normalization

Client-side API modules should normalize failed `fetch` responses with
`normalizeApiError` from `xconfess-frontend/app/lib/api/errors.ts`. App Router
proxy handlers should return JSON via `createApiErrorResponse` or the named
helpers in `xconfess-frontend/app/lib/utils/proxyError.ts`; avoid new ad-hoc
`new Response(JSON.stringify({ error }))` blocks.
