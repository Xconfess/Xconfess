# ADR-001: Authentication Strategy — Cookie/JWT vs NextAuth

## Status

Accepted

## Context

xConfess is an anonymous confession platform. Users need to authenticate to post confessions, react, and tip — but anonymity is a core product guarantee. The auth system must issue short-lived tokens, support cookie-based sessions for the browser, and not leak identity. The backend is a standalone NestJS API, not a Next.js API route, so auth must work over a separate origin.

## Options Considered

- **Option A — NextAuth.js**: Managed auth library for Next.js. Handles OAuth providers, sessions, and CSRF out of the box. Tightly coupled to Next.js API routes.
- **Option B — Custom JWT + HttpOnly cookies**: The NestJS backend issues a signed JWT stored in an HttpOnly cookie. Passport-JWT validates it on every request. CSRF protection is applied separately via csurf.
- **Option C — JWT in Authorization header (Bearer token)**: Classic stateless JWT sent in the Authorization header from the frontend.

## Decision

We chose **Option B** — custom JWT stored in HttpOnly cookies, validated by Passport-JWT on the NestJS backend.

NextAuth (Option A) requires Next.js API routes as the auth server, which would split auth logic across two runtimes and complicate the standalone NestJS API. Bearer tokens (Option C) are accessible to JavaScript, creating XSS risk that is incompatible with the anonymity guarantee. HttpOnly cookies are invisible to JS and work naturally with credentialed cross-origin requests.

## Consequences

### Positive

- Tokens are invisible to JavaScript, mitigating XSS token theft
- Auth logic lives entirely in the NestJS backend — single source of truth
- Passport-JWT is well-tested and integrates cleanly with NestJS guards

### Negative

- Cookie-based auth requires CSRF protection on all state-changing endpoints (addressed in ADR-001 companion: see src/common/midleware/middleware.ts)
- Cross-origin requests require CORS credentials config and matching SameSite cookie policy
- No built-in OAuth provider support — social login would require additional work

## References

- xconfess-backend/src/auth/jwt.strategy.ts
- xconfess-backend/src/auth/jwt-auth.guard.ts
- xconfess-backend/src/common/midleware/middleware.ts
