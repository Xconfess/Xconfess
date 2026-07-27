# Full-Stack Smoke Test Checklist

## Automated Smoke Script (Quick Start)

Run the single command below after `docker compose up` and both servers are running:

```bash
./scripts/smoke-test.sh [--verbose]
```

Covers all five critical flows automatically. Exits non-zero if any critical flow fails.
Failures include `requestId` and `route` in output. Tokens are redacted from logs.

**Seeded credentials** (from `scripts/seed.ts`):
| User | Email | Password |
|------|-------|----------|
| seed_alice | seed_alice@example.com | password123 |
| seed_admin | seed_admin@example.com | password123 |

**Playwright e2e suite** (mocked, for CI):
```bash
cd xconfess-frontend
npx playwright test --project=smoke
```

---

**Purpose:** Quick validation that core functionality is working across backend, frontend, authentication, and admin features.

**Prerequisites:**
- Docker running: `docker compose -f compose.yaml up -d` (Postgres 16 on `localhost:55432`, Redis 7 on `localhost:6379`)
- Backend: `npm run dev --workspace=xconfess-backend` (listens on `http://localhost:5000`)
- Frontend: `npm run dev --workspace=xconfess-frontend` (listens on `http://localhost:3000`)
- Backend `.env` configured with `JWT_SECRET` and database credentials
- Frontend `.env.local` configured with `BACKEND_API_URL=http://localhost:5000`

---

## 1. Backend Health & Readiness

### 1.1 Root Health Check (Unauthenticated)
- **Endpoint:** `GET http://localhost:5000/`
- **Expected Result:** ✅ **PASS**
- **Expected Response:** `{ "message": "Hello, world!" }` or similar greeting
- **Evidence:** Screenshot of HTTP 200 response in Postman/curl output

### 1.2 Liveness Probe (Unauthenticated)
- **Endpoint:** `GET http://localhost:5000/health/live`
- **Expected Result:** ✅ **PASS**
- **Expected Response:** HTTP 200, `{ "status": "ok" }`
- **Evidence:** Screenshot of HTTP 200 response

### 1.3 Readiness Probe (Unauthenticated)
- **Endpoint:** `GET http://localhost:5000/health/ready`
- **Expected Result:** ✅ **PASS** (if dependencies are running)
- **Expected Response:** HTTP 200 with checks for database, Redis, queues, and schema
- **Sample Success:**
  ```json
  {
    "status": "ok",
    "checks": {
      "database": { "status": "up" },
      "redis": { "status": "up" },
      "queues": { "status": "up" },
      "schema": { "status": "up" }
    }
  }
  ```
- **Expected on Failure:** HTTP 503 if dependencies missing
- **Evidence:** Screenshot of response (both success and failure scenarios useful for deployment troubleshooting)

---

## 2. Frontend Login Page

### 2.1 Login Page Loads (Unauthenticated)
- **URL:** `http://localhost:3000/auth/login`
- **Expected Result:** ✅ **PASS**
- **Expected Content:**
  - Login form with email/password fields (or alternative auth method)
  - Submit button
  - Link to register page
  - No 401/403 errors
- **Evidence:** Screenshot of login page, browser console (no errors)

### 2.2 Redirect to Login When Accessing Protected Route (Unauthenticated)
- **URL:** `http://localhost:3000/` (as unauthenticated user)
- **Expected Result:** ✅ **PASS** - Redirects to `/auth/login`
- **Expected Behavior:** Cookie-based session check prevents access; user is redirected or shown login
- **Evidence:** Screenshot showing redirect to login page

---

## 3. Confession Feed

### 3.1 Fetch Confessions API (Unauthenticated)
- **Endpoint:** `GET http://localhost:5000/confessions`
- **Expected Result:** ✅ **PASS**
- **Query Parameters:** `page=1&limit=20` (optional)
- **Expected Response:** HTTP 200 with paginated confession list
- **Sample Success:**
  ```json
  {
    "data": [
      {
        "id": "uuid-1",
        "message": "I secretly watch reality TV",
        "gender": "female",
        "tags": ["humor"],
        "view_count": 42,
        "created_at": "2026-04-25T10:00:00Z"
      }
    ],
    "total": 150,
    "page": 1,
    "limit": 20
  }
  ```
- **Evidence:** Screenshot of HTTP 200 response, record the total count for comparison in future runs

### 3.2 Confession Feed Page Loads (Authenticated)
- **URL:** `http://localhost:3000/` (as authenticated user)
- **Expected Result:** ✅ **PASS**
- **Expected Content:**
  - Confession cards displaying confessions
  - Pagination or infinite scroll
  - Reaction buttons (like/emoji)
  - Comments section visible
  - Comment count displayed
  - No 401/403 errors
- **Prerequisites:** 
  - User must be logged in
  - At least one confession exists in database
- **Evidence:** Screenshot of feed page showing at least one confession card, browser console (no errors)

### 3.3 Create Confession (Authenticated)
- **Endpoint:** `POST http://localhost:5000/confessions`
- **Expected Result:** ✅ **PASS** (requires authentication)
- **Request Body:**
  ```json
  {
    "message": "This is a test confession for smoke testing",
    "gender": "female",
    "tags": ["test"]
  }
  ```
- **Expected Response:** HTTP 201 with confession object including ID and timestamp
- **Evidence:** Screenshot of HTTP 201 response, note the returned `id` for detail page test

---

## 4. Confession Detail Page

### 4.1 Fetch Single Confession (Unauthenticated)
- **Endpoint:** `GET http://localhost:5000/confessions/{confessionId}`
- **Expected Result:** ✅ **PASS**
- **Expected Response:** HTTP 200 with full confession object
- **Sample Success:**
  ```json
  {
    "id": "uuid-1",
    "message": "I secretly watch reality TV",
    "gender": "female",
    "tags": ["humor"],
    "view_count": 43,
    "created_at": "2026-04-25T10:00:00Z",
    "reactions": [
      { "emoji": "❤️", "count": 5 }
    ],
    "comments": [
      { "id": "comment-uuid", "message": "Same!", "author_gender": "male" }
    ]
  }
  ```
- **Evidence:** Screenshot of HTTP 200 response, include the confession ID used

### 4.2 Confession Detail Page Loads (Authenticated)
- **URL:** `http://localhost:3000/confessions/{confessionId}` (using an existing confession ID)
- **Expected Result:** ✅ **PASS**
- **Expected Content:**
  - Full confession message displayed
  - Reaction buttons (emojis)
  - Comments section
  - Comment input field
  - Author gender displayed (anonymized)
  - No 401/403 errors
- **Prerequisites:**
  - User must be logged in
  - Confession ID must exist
- **Evidence:** Screenshot of detail page showing full confession content and comments

### 4.3 Post Comment on Confession (Authenticated)
- **Endpoint:** `POST http://localhost:5000/confessions/{confessionId}/comments`
- **Expected Result:** ✅ **PASS** (requires authentication)
- **Request Body:**
  ```json
  {
    "message": "Test comment from smoke test"
  }
  ```
- **Expected Response:** HTTP 201 with comment object
- **Evidence:** Screenshot of HTTP 201 response, then verify comment appears on detail page (refresh if needed)

---

## 5. Report Submission

### 5.1 Submit Report on Confession (Unauthenticated)
- **Endpoint:** `POST http://localhost:5000/reports`
- **Expected Result:** ✅ **PASS** (public endpoint, no auth required)
- **Request Body:**
  ```json
  {
    "confessionId": "uuid-1",
    "type": "offensive",
    "reason": "Contains hate speech (test report)"
  }
  ```
- **Expected Response:** HTTP 201 with report object including ID, status (`pending`), and timestamp
- **Sample Success:**
  ```json
  {
    "id": "report-uuid",
    "confessionId": "uuid-1",
    "type": "offensive",
    "reason": "Contains hate speech (test report)",
    "status": "pending",
    "createdAt": "2026-05-29T10:00:00Z"
  }
  ```
- **Evidence:** Screenshot of HTTP 201 response, note the report ID

### 5.2 Report Types
- **Valid Report Types:** `offensive`, `spam`, `inappropriate`, `other`
- **Test Each Type:** At least one submission for each type or a subset (typically `offensive` and `spam`)
- **Evidence:** Screenshots showing successful submissions with different types

---

## 6. Admin Route: Notification Diagnostics

### 6.1 Access Admin Endpoint Without Authentication (Unauthenticated)
- **Endpoint:** `GET http://localhost:5000/diagnostics/notifications`
- **Expected Result:** ❌ **FAIL** (HTTP 401 or 403)
- **Expected Response:** Error response (Unauthorized)
- **Evidence:** Screenshot of HTTP 401/403 error response

### 6.2 Access Admin Endpoint With Authentication But Non-Admin Role
- **Endpoint:** `GET http://localhost:5000/diagnostics/notifications`
- **Headers:** Include valid JWT token for regular (non-admin) user
- **Expected Result:** ❌ **FAIL** (HTTP 403 Forbidden)
- **Expected Response:** `{ "message": "Forbidden", "statusCode": 403 }`
- **Evidence:** Screenshot of HTTP 403 error response

### 6.3 Access Admin Endpoint With Admin Authentication (Authenticated Admin)
- **Endpoint:** `GET http://localhost:5000/diagnostics/notifications`
- **Headers:** Include valid JWT token for admin user
- **Expected Result:** ✅ **PASS** (HTTP 200)
- **Expected Response:** Notification queue diagnostics
- **Sample Success:**
  ```json
  {
    "queueDepth": 5,
    "dlqDepth": 0,
    "activeJobs": 3,
    "completedJobs": 127,
    "failedJobs": 2,
    "delayedJobs": 1,
    "queues": [
      {
        "name": "notifications",
        "status": "active"
      }
    ]
  }
  ```
- **Prerequisites:**
  - Admin user account must exist
  - Admin user must have valid JWT token
  - Background jobs must be enabled (`ENABLE_BACKGROUND_JOBS=true`) or queue reporting should indicate `disabled` mode
- **Evidence:** Screenshot of HTTP 200 response with queue metrics

### 6.4 Admin Dashboard Page (Authenticated Admin)
- **URL:** `http://localhost:3000/admin/dashboard`
- **Expected Result:** ✅ **PASS** (for admin users)
- **Expected Content:**
  - Admin panel layout
  - Navigation to reports, users, templates, audit logs
  - Dashboard metrics/stats
  - No 401/403 errors for admin users
- **Prerequisites:** User must be authenticated and have admin role
- **Evidence:** Screenshot of admin dashboard page

### 6.5 Reports Admin Page (Authenticated Admin)
- **URL:** `http://localhost:3000/admin/reports`
- **Expected Result:** ✅ **PASS** (for admin users)
- **Expected Content:**
  - List of submitted reports
  - Report status (pending, resolved, etc.)
  - Filtering/search options
  - Action buttons (resolve, etc.)
  - No 401/403 errors for admin users
- **Prerequisites:** 
  - User must be authenticated and have admin role
  - At least one report should exist (from section 5.1)
- **Evidence:** Screenshot of reports page showing at least one report

---

## Evidence Package for PR

**Attach the following to the pull request:**

1. **Screenshots Folder** (`smoke-test-evidence/`)
   - `01-health-root.png` — Root endpoint response
   - `02-health-live.png` — Liveness probe response
   - `03-health-ready.png` — Readiness probe response
   - `04-login-page.png` — Login page load
   - `05-confession-feed-api.png` — Confessions API response
   - `06-confession-feed-ui.png` — Confession feed page loaded
   - `07-confession-detail-api.png` — Single confession API response
   - `08-confession-detail-ui.png` — Confession detail page
   - `09-report-submit-api.png` — Report submission response
   - `10-auth-required-fail.png` — Admin endpoint without auth (HTTP 401/403)
   - `11-admin-diagnostics-pass.png` — Admin diagnostics endpoint (HTTP 200, if admin access available)
   - `12-admin-dashboard.png` — Admin dashboard page
   - `13-admin-reports.png` — Admin reports page

2. **Summary Document** (`smoke-test-summary.txt`)
   - Date tested
   - Environment (localhost versions)
   - Results: PASS/FAIL for each section
   - Any failed tests: description and remediation steps
   - Test execution time

3. **API Request/Response Log** (`smoke-test-requests.log`)
   - Curl commands or Postman collection export for reproducibility
   - Example:
     ```
     # Health Check
     curl -X GET http://localhost:5000/ -w "\n%{http_code}\n"
     
     # Confessions List
     curl -X GET "http://localhost:5000/confessions?page=1&limit=20" -w "\n%{http_code}\n"
     ```

4. **Optional: Automated Test Report**
   - If using Playwright or Jest tests, include coverage report
   - Test execution logs (pass/fail counts)

---

## Quick Validation Notes

- **Port Assumptions:** Backend on 5000, Frontend on 3000. Update URLs if running on different ports.
- **Database State:** Tests assume database is populated. If tests fail at step 3.1 or 4.1, ensure seed data exists or create test data via 3.3.
- **Authentication:** Tests assume cookie-based session auth. If using `NEXT_PUBLIC_DEV_BYPASS_AUTH=true`, some protected route tests may behave differently.
- **Admin Access:** To test 6.3 and 6.4, either:
  - Create an admin user in the database directly
  - Use a test admin account if available
  - Or skip if not applicable to current release
- **Real-Time Features:** WebSocket/reactions may require additional setup; basic submission/retrieval is sufficient for smoke test.
- **External Services:** Stellar contract calls, email delivery, and Stripe integration are NOT tested in this basic checklist. They are covered in integration tests.

---

## Test Execution Checklist

- [ ] Docker infrastructure running (`docker compose up -d`)
- [ ] Seed data loaded (`npm run seed`)
- [ ] Backend dev server started and healthchecks pass
- [ ] Frontend dev server started and loading
- [ ] **Flow 1 — Login / Session**: `POST /auth/login` returns 200, session persists on reload, unauthenticated redirect works
- [ ] **Flow 2 — Confession Create**: `POST /confessions` returns 201, confession appears in feed
- [ ] **Flow 3 — Comment**: `POST /confessions/:id/comments` returns 201, comment visible on detail page
- [ ] **Flow 4 — Reaction**: `POST /reactions` returns 201/200, reaction count updates
- [ ] **Flow 5 — Report**: `POST /reports` returns 201, confirmation shown to user
- [ ] Smoke script exits 0 (no critical failures)
- [ ] No tokens visible in `smoke-test-requests.log`
- [ ] Failures (if any) include `requestId` and route in output
- [ ] Admin routes reject unauthenticated requests with 401/403
- [ ] PR description updated with smoke test results

---

## Regression Test Pattern

To track regressions across releases, **capture baseline metrics on first pass:**

- Total confessions count at section 3.1
- Response times for each endpoint (useful for performance regression detection)
- Admin endpoint availability and response structure
- UI page load times (DevTools → Performance tab)

Compare these metrics in future smoke tests to detect degradation.
