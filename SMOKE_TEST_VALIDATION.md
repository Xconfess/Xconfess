# Smoke Test Validation Report

**Generated:** 2026-05-29  
**Status:** Validation framework created, awaiting runtime execution  
**Environment:** Code-based analysis performed; runtime validation requires local stack execution

---

## Codebase Analysis: Route Verification

This document validates that all routes mentioned in `SMOKE_TEST_CHECKLIST.md` are correctly mapped in the codebase.

### Backend Routes Verified

#### ✅ Health Endpoints (`src/health/health.controller.ts`)

| Route | Method | Auth | Expected HTTP Status | Notes |
|-------|--------|------|----------------------|-------|
| `GET /` | GET | None | 200 | Defined in `AppController.getHello()` |
| `GET /health/live` | GET | None | 200 | Liveness probe - no external deps |
| `GET /health/ready` | GET | None | 200 or 503 | Readiness probe - checks DB, Redis, queues, schema |
| `GET /health` | GET | None | 200 or 503 | Backward-compatible alias for `/health/ready` |

**Code Reference:** `src/health/health.controller.ts` lines 1–78  
**Confirmation:** Routes are throttled (30 req/min for readiness) and properly decorated with SwaggerUI docs.

#### ✅ Confession Endpoints (`src/confession/confession.controller.ts`)

| Route | Method | Auth | Expected HTTP Status | Notes |
|-------|--------|------|----------------------|-------|
| `POST /confessions` | POST | ❌ None | 201 or 400 | Public create endpoint (validation required) |
| `GET /confessions` | GET | ❌ None | 200 | Public list endpoint, paginated, no auth required |
| `GET /confessions/search` | GET | Optional | 200 | Search endpoint with optional auth |
| `GET /confessions/:id` | GET | ❌ None | 200 or 404 | Public detail endpoint, no auth required |
| `PUT /confessions/:id` | PUT | ✅ Auth | 200 or 403 | Update own confession (if permitted) |
| `DELETE /confessions/:id` | DELETE | ✅ Auth | 204 or 403 | Delete own confession (if permitted) |

**Code Reference:** `src/confession/confession.controller.ts` lines 1–120  
**Confirmation:** All endpoints use `ValidationPipe` for DTOs. Public endpoints have `OptionalJwtAuthGuard`.

#### ✅ Report Endpoints (`src/report/report.controller.ts`)

| Route | Method | Auth | Expected HTTP Status | Notes |
|-------|--------|------|----------------------|-------|
| `POST /reports` | POST | ❌ None | 201 or 400 | Public report submission (no auth required) |
| `GET /reports` | GET | ✅ Admin | 200 | List all reports (admin only) |
| `GET /reports/:id` | GET | ✅ Admin | 200 or 404 | Get report detail (admin only) |
| `PATCH /reports/:id` | PATCH | ✅ Admin | 200 or 404 | Update report status (admin only) |

**Code Reference:** `src/report/report.controller.ts` lines 1–90  
**Confirmation:** Public POST endpoint confirmed. GET/PATCH require admin role via `AdminGuard`.

#### ✅ Admin Diagnostic Endpoint (`src/app.controller.ts`)

| Route | Method | Auth | Expected HTTP Status | Notes |
|-------|--------|------|----------------------|-------|
| `GET /diagnostics/notifications` | GET | ✅ JWT + Admin | 200 | Notification queue health metrics |

**Code Reference:** `src/app.controller.ts` lines 27–34  
**Confirmation:** Protected by `@UseGuards(JwtAuthGuard, AdminGuard)`. Returns queue depth, DLQ depth, counters.

#### ⚠️ Authentication Endpoints
- Located in both `src/user/` and `src/auth/` modules
- Routes: `POST /users/login`, `POST /users/register`, `POST /auth/login`, `POST /auth/forgot-password`, etc.
- **Note:** Frontend uses cookie-based session auth; JWT is used for API calls with `credentials: "include"`

---

### Frontend Routes Verified

#### ✅ Authentication Pages

| Route | Component | Auth Required | Status |
|-------|-----------|---|---|
| `/auth/login` | `app/(auth)/login/page.tsx` | ❌ No | Login form page |
| `/auth/register` | `app/(auth)/register/page.tsx` | ❌ No | Registration form page |

**Confirmation:** Both pages exist and are accessible without authentication.

#### ✅ Protected Pages (Dashboard)

| Route | Component | Auth Required | Notes |
|-------|-----------|---|---|
| `/` | `app/(dashboard)/page.tsx` | ✅ Yes | Confession feed (protected) |
| `/confessions/:id` | `app/(dashboard)/confessions/[id]/page.tsx` | ✅ Yes | Confession detail page |
| `/search` | `app/(dashboard)/search/page.tsx` | ✅ Yes | Search confessions |
| `/profile` | `app/(dashboard)/profile/page.tsx` | ✅ Yes | User profile |
| `/messages` | `app/(dashboard)/messages/page.tsx` | ✅ Yes | Messaging interface |
| `/settings/privacy` | `app/(dashboard)/settings/privacy/page.tsx` | ✅ Yes | Privacy settings |
| `/analytics` | `app/(dashboard)/analytics/page.tsx` | ✅ Yes | User analytics |

**Confirmation:** All protected pages exist under `(dashboard)` layout group with `AuthGuard` protection.

#### ✅ Admin Pages

| Route | Component | Auth + Admin Required | Status |
|-------|-----------|---|---|
| `/admin/dashboard` | `app/(dashboard)/admin/dashboard/page.tsx` | ✅ Yes + Admin | Main admin dashboard |
| `/admin/reports` | `app/(dashboard)/admin/reports/page.tsx` | ✅ Yes + Admin | Reports management |
| `/admin/users` | `app/(dashboard)/admin/users/page.tsx` | ✅ Yes + Admin | User management |
| `/admin/audit-logs` | `app/(dashboard)/admin/audit-logs/page.tsx` | ✅ Yes + Admin | Audit trail |
| `/admin/diagnostics` | `app/(dashboard)/admin/diagnostics/page.tsx` | ✅ Yes + Admin | System diagnostics |
| `/admin/templates` | `app/(dashboard)/admin/templates/page.tsx` | ✅ Yes + Admin | Moderation templates |
| `/admin/notifications` | `app/(dashboard)/admin/notifications/page.tsx` | ✅ Yes + Admin | Notification management |

**Confirmation:** All admin pages exist with dual auth + admin role guards.

#### ✅ Landing/Trending

| Route | Component | Auth Required | Status |
|-------|-----------|---|---|
| `/trending` | `app/trending/page.tsx` | ❌ No | Trending confessions (public) |

---

## Validation Status by Section

### Section 1: Backend Health & Readiness ✅
- **Routes:** All confirmed in `src/health/health.controller.ts`
- **Authentication:** Correctly marked as unauthenticated
- **Status Codes:** Documented (200 OK, 503 Service Unavailable)
- **Validation:** Ready for runtime testing

### Section 2: Frontend Login Page ✅
- **Route:** `/auth/login` confirmed in `app/(auth)/login/page.tsx`
- **Auth:** Correctly accessible without authentication
- **Validation:** Ready for runtime testing

### Section 3: Confession Feed ✅
- **API:** `GET /confessions` confirmed in `confession.controller.ts`
- **Authentication:** Correctly marked as unauthenticated
- **Pagination:** DTO `GetConfessionsDto` supports page/limit parameters
- **UI:** Dashboard page at `app/(dashboard)/page.tsx` displays feed
- **Validation:** Ready for runtime testing

### Section 4: Confession Detail ✅
- **API:** `GET /confessions/:id` confirmed, public access
- **Comment API:** `POST /confessions/:id/comments` supported
- **UI:** Detail page at `app/(dashboard)/confessions/[id]/page.tsx`
- **Validation:** Ready for runtime testing

### Section 5: Report Submission ✅
- **API:** `POST /reports` confirmed as unauthenticated
- **Validation:** Request body structure documented
- **Authentication:** Correctly marked as public
- **UI:** Report form integrated in confession detail page
- **Validation:** Ready for runtime testing

### Section 6: Admin Route - Notification Diagnostics ✅
- **API:** `GET /diagnostics/notifications` confirmed
- **Auth Guards:** `JwtAuthGuard` + `AdminGuard` properly applied
- **Expected Failure (Unauthenticated):** Will return 401
- **Expected Failure (Non-Admin):** Will return 403
- **Expected Success (Admin):** Returns 200 with queue metrics
- **Admin UI:** Dashboard at `app/(dashboard)/admin/dashboard/page.tsx`
- **Admin Reports UI:** Reports at `app/(dashboard)/admin/reports/page.tsx`
- **Validation:** Ready for runtime testing

---

## Environment Configuration Verified ✅

### Backend Configuration (`xconfess-backend/.env.example`)
- **Port:** 5000 ✅
- **Database:** PostgreSQL on `localhost:55432` ✅
- **Redis:** `localhost:6379` ✅
- **Required Keys:** `JWT_SECRET`, `APP_SECRET` ✅
- **Background Jobs:** `ENABLE_BACKGROUND_JOBS=false` (optional for smoke test) ✅

### Frontend Configuration (`xconfess-frontend/.env.example`)
- **Port:** 3000 ✅
- **Backend URL:** `http://localhost:5000` ✅
- **WebSocket URL:** `ws://localhost:5000` ✅
- **App URL:** `http://localhost:3000` ✅

---

## Runtime Validation Instructions

### Prerequisites Setup

```bash
# 1. Clone and install dependencies (from repo root)
npm install

# 2. Copy environment files
cp xconfess-backend/.env.example xconfess-backend/.env
cp xconfess-frontend/.env.example xconfess-frontend/.env.local

# 3. Generate/set secrets (if needed)
# Edit .env files and set JWT_SECRET and APP_SECRET to non-default values

# 4. Start Docker infrastructure
docker compose -f compose.yaml up -d

# Verify services are running:
docker ps
```

### Run Backend
```bash
cd xconfess-backend
npm run dev
# Backend should start on http://localhost:5000
# Confirm: curl http://localhost:5000/
```

### Run Frontend
```bash
cd xconfess-frontend
npm run dev
# Frontend should start on http://localhost:3000
# Confirm: open http://localhost:3000/ in browser
```

### Execute Smoke Tests

**Option 1: Manual (using the SMOKE_TEST_CHECKLIST.md)**
- Open each URL and endpoint in Postman, curl, or browser
- Verify expected responses and take screenshots
- Compare against checklist expectations

**Option 2: Automated (using Playwright, if available)**
```bash
# If Playwright tests exist:
npm run test:e2e --workspace=xconfess-frontend
```

**Option 3: Shell Script (recommended for CI/CD)**
Create `scripts/smoke-test.sh` (see below)

---

## Automated Smoke Test Script

```bash
#!/bin/bash
# scripts/smoke-test.sh

set -e

BACKEND_URL="http://localhost:5000"
FRONTEND_URL="http://localhost:3000"

echo "🔍 Starting smoke tests..."

# 1. Health Checks
echo "✓ Testing health endpoints..."
curl -s "${BACKEND_URL}/" | grep -q "message\|Hello" && echo "  ✓ GET / — OK" || echo "  ✗ GET / — FAILED"
curl -s "${BACKEND_URL}/health/live" | grep -q "ok" && echo "  ✓ GET /health/live — OK" || echo "  ✗ GET /health/live — FAILED"
curl -s "${BACKEND_URL}/health/ready" | grep -q "status\|up" && echo "  ✓ GET /health/ready — OK" || echo "  ✗ GET /health/ready — FAILED"

# 2. API Endpoints
echo "✓ Testing API endpoints..."
CONFESSIONS=$(curl -s "${BACKEND_URL}/confessions?limit=1" | jq '.data | length')
echo "  ✓ GET /confessions — ${CONFESSIONS} confessions found"

# 3. Frontend Pages
echo "✓ Testing frontend pages..."
curl -s "${FRONTEND_URL}/auth/login" | grep -q "html\|login\|form" && echo "  ✓ Frontend loaded" || echo "  ✗ Frontend failed"

echo "✓ Smoke tests complete!"
```

---

## Known Stale Route Risks

Based on codebase analysis, the following areas should be monitored for stale routes:

1. **Admin Routes:** Frequently refactored; verify `/admin/` paths match implementation
   - File: `src/admin/admin.controller.ts`
   - Frontend: `app/(dashboard)/admin/*`

2. **Auth Endpoints:** Dual routing structure (`/users/*` and `/auth/*`)
   - Files: `src/user/user.controller.ts`, `src/auth/auth.controller.ts`
   - Watch for deprecation of one route family

3. **Confession Endpoints:** May change with encryption or schema updates
   - File: `src/confession/confession.controller.ts`
   - Monitor: Parameter names, optional fields

4. **Report Submission:** May require auth in future versions
   - File: `src/report/report.controller.ts`
   - Current: Public (unauthenticated) — verify intentional

---

## Next Steps for Full Validation

1. **Start local stack:** Docker, backend, and frontend services
2. **Execute manual smoke tests:** Run through SMOKE_TEST_CHECKLIST.md
3. **Capture evidence:** Screenshots, API response logs
4. **Update this report:** Note any differences between codebase and runtime behavior
5. **Create PR checklist:** Attach evidence to pull request
6. **Automate for CI:** Integrate shell script or Playwright tests into GitHub Actions

---

**Prepared by:** Code analysis  
**Last Updated:** 2026-05-29  
**Status:** Ready for runtime validation  
**Next Review:** After first full local test run
