# ADR-001: Authentication Strategy — Cookie/JWT hybrid with frontend-managed sessions

## Status

Accepted (revised 2026-07-20 — corrected architecture description; original text stated the
backend sets HttpOnly cookies, but the backend is stateless JWT and the cookie is managed
entirely in the Next.js route handler)

## Context

xConfess is an anonymous confession platform. Users must be able to authenticate to post
confessions, react, and tip, while the platform must never leak their identity. Key constraints:

- The NestJS backend is a standalone API (`localhost:5000`). It is not a Next.js route.
- The Next.js frontend is an App Router app (`localhost:3000`).
- Anonymity is a core product guarantee — tokens must not be readable by JavaScript.
- Auth must survive cross-origin requests (frontend ↔ backend on different ports locally,
  different origins in production).

## Options Considered

| Option | Description | Verdict |
|--------|-------------|---------|
| A — NextAuth.js | Managed auth library; handles OAuth, sessions, CSRF. Tightly coupled to Next.js API routes acting as the auth server. | Rejected — splits auth logic across two runtimes; the backend would become a passive data store |
| B — Backend-issued HttpOnly cookies | NestJS sets `Set-Cookie` on login; Passport-JWT extracts the cookie on every request. | Rejected in practice — backend and frontend run on different origins (ports); the `Set-Cookie` response from `localhost:5000` is not accessible to the Next.js server on `localhost:3000` without a shared domain, and credentialed cross-origin cookie writes have strict browser restrictions |
| C — JWT in `Authorization` Bearer header | Classic stateless JWT from client JS. | Rejected — token stored in JS memory or localStorage is accessible to XSS, violating the anonymity guarantee |
| D — Stateless backend JWT + frontend-managed HttpOnly cookie (chosen) | Backend returns `access_token` as JSON; the Next.js route handler (`app/api/auth/session/route.ts`) receives it server-side and writes it as an HttpOnly cookie on the same origin as the frontend. The frontend then forwards the token as a `Bearer` header in server-side requests to the backend. | Accepted |

## Decision

**Option D** — the NestJS backend issues a signed JWT as a JSON response body. The Next.js App
Router route handler (`app/api/auth/session/route.ts`) receives the token **server-side**,
stores it in an HttpOnly session cookie on the frontend's origin, and forwards it as an
`Authorization: Bearer` header on subsequent backend calls. The backend remains a pure
stateless JWT API with no cookie awareness.

This architecture was chosen because:

1. **HttpOnly + same-origin write** — The cookie is written by the Next.js server (same
   origin as the browser), so `Set-Cookie` always succeeds regardless of cross-origin
   restrictions on the backend.
2. **Token never exposed to browser JS** — the `access_token` value travels in the response
   body of a server-to-server call (`route.ts → NestJS`), then immediately into an HttpOnly
   cookie. JavaScript in the browser can never read it.
3. **Stateless backend** — NestJS stays a clean REST API with no session store. Scaling
   horizontally requires no sticky sessions.
4. **CSRF mitigated by SameSite=Strict** — the cookie is tagged `SameSite=Strict` so it is
   never sent on cross-site navigations or form submissions.

## Cookie Security Properties

All cookie attributes are centralized in `xconfess-frontend/lib/cookieConfig.ts`. The
authoritative source of truth for any change to cookie settings is that file.

| Attribute | Value | Rationale |
|-----------|-------|-----------|
| `HttpOnly` | `true` | Prevents JavaScript access (XSS mitigation) |
| `Secure` | `true` in production, `false` in local dev | HTTPS-only in production; see local dev exception below |
| `SameSite` | `Strict` | Cookie not sent on any cross-site request; strongest CSRF protection available |
| `Path` | `/` | Scoped to the entire frontend app |
| `MaxAge` | 604 800 s (7 days) | Matches the JWT expiry configured in the NestJS backend |

### Cookie Clearing (Logout)

A bare `cookieStore.delete(name)` call may silently fail if the browser stored the cookie
with non-default attributes (e.g. `Path=/`, `SameSite=Strict`) that don't match the implicit
defaults of the delete call. To guarantee clearing, the logout path calls:

```ts
cookieStore.set(SESSION_COOKIE_NAME, "", SESSION_COOKIE_CLEAR_OPTIONS);
```

where `SESSION_COOKIE_CLEAR_OPTIONS` carries the same `path`, `sameSite`, `httpOnly`, and
`secure` as the original write, plus `maxAge: 0` and `expires: new Date(0)`.

This pattern is applied in three places in `route.ts`:
- `DELETE` (explicit logout)
- `GET` when the backend returns `401` (expired / invalid session)

## Local Development Exception

`Secure: false` is intentional in local development (`NODE_ENV !== "production"`).

- **Why:** `localhost` does not serve HTTPS by default. A `Secure` cookie on plain HTTP would
  never be sent, making local login impossible.
- **Risk:** None in practice — `localhost` is not reachable from the internet.
- **How to test the Secure flag locally:** Run `next dev --experimental-https` and set
  `NODE_ENV=production` in `.env.local` (never commit that change). Alternatively, inspect
  the `Set-Cookie` response header in production via browser DevTools or a staging deployment.
- **Never** deploy with `NODE_ENV=development` to a public host.

The `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` flag in `.env.local` skips the auth flow entirely for
UI development. It must never be set in any environment facing real users.

## Data Flow

```
Browser
  │  POST /api/auth/session  { email, password }
  ▼
Next.js route handler (route.ts)  ── POST /auth/login ──►  NestJS backend
  │                                ◄── { access_token }  ──
  │  cookieStore.set("xconfess_session", token, SESSION_COOKIE_OPTIONS)
  ▼
Browser receives Set-Cookie: xconfess_session=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/

Browser
  │  GET /api/auth/session  (cookie sent automatically, HttpOnly)
  ▼
Next.js route handler  ── GET /auth/session  Authorization: Bearer <token>  ──►  NestJS backend
  │                     ◄── { id, username, role, … }  ──
  ▼
Browser receives { authenticated: true, user: { … } }

Browser
  │  DELETE /api/auth/session
  ▼
Next.js route handler  cookieStore.set("xconfess_session", "", SESSION_COOKIE_CLEAR_OPTIONS)
  ▼
Browser receives Set-Cookie: xconfess_session=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/
```

## Consequences

### Positive

- JWT token is never accessible to browser JavaScript, eliminating XSS-based token theft.
- Backend is a clean, stateless REST API — no session store required.
- Cookie clearing is reliable because the exact write/clear tuple matches in all paths.
- SameSite=Strict gives the strongest available CSRF protection without a separate CSRF token.
- Single source of truth for all cookie options: `lib/cookieConfig.ts`.

### Negative

- No built-in OAuth/social login support — would require additional work.
- The Next.js route handler acts as a lightweight auth proxy; adding new auth endpoints
  requires updating both the NestJS controller and the route handler.
- `SameSite=Strict` breaks authentication flows initiated from external links (e.g. a "log
  in via magic link in email" flow) because the cookie won't be sent on the first cross-site
  navigation. If such flows are added in future, `SameSite=Lax` may be needed, which requires
  revisiting this ADR.

## References

- `xconfess-frontend/lib/cookieConfig.ts` — centralized cookie options (authoritative)
- `xconfess-frontend/app/api/auth/session/route.ts` — session route handler
- `xconfess-backend/src/auth/auth.controller.ts` — login / logout endpoints
- `xconfess-backend/src/auth/jwt.strategy.ts` — Passport-JWT strategy (Bearer header)
- `xconfess-backend/src/auth/jwt-auth.guard.ts` — JwtAuthGuard
- `xconfess-backend/src/common/midleware/middleware.ts` — CORS and security middleware
