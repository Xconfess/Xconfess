# Smoke Test - Manual curl Testing Guide

Quick reference for manually testing each endpoint in the smoke test checklist using `curl`.

## Setup

```bash
# Set environment variables for convenience
export BACKEND_URL="http://localhost:5000"
export FRONTEND_URL="http://localhost:3000"
```

---

## Section 1: Backend Health & Readiness

### 1.1 Root Health Check
```bash
curl -X GET "$BACKEND_URL/" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n"
```

**Expected:** HTTP 200, response like `{"message":"Hello, world!"}`

### 1.2 Liveness Probe
```bash
curl -X GET "$BACKEND_URL/health/live" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n"
```

**Expected:** HTTP 200, response: `{"status":"ok"}`

### 1.3 Readiness Probe
```bash
curl -X GET "$BACKEND_URL/health/ready" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" | jq .
```

**Expected:** HTTP 200 (all deps up) or HTTP 503 (one or more failed)

**Sample success response:**
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

---

## Section 2: Confession Feed

### 2.1 Fetch Confessions (Paginated)
```bash
curl -X GET "$BACKEND_URL/confessions?page=1&limit=20" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" | jq .
```

**Expected:** HTTP 200 with paginated list

**Sample response:**
```json
{
  "data": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "message": "I secretly enjoy watching reality TV shows.",
      "gender": "female",
      "tags": ["humor"],
      "view_count": 42,
      "created_at": "2026-04-25T10:00:00.000Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

### 2.2 Create Confession
```bash
curl -X POST "$BACKEND_URL/confessions" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "This is a test confession for smoke testing",
    "gender": "female",
    "tags": ["test"]
  }' \
  -w "\nStatus: %{http_code}\n" | jq .
```

**Expected:** HTTP 201, response includes `id` and `created_at`

**Save the returned `id` for use in section 3 tests**

---

## Section 3: Confession Detail

### 3.1 Fetch Single Confession (Unauthenticated)
```bash
# Replace {confessionId} with an actual ID from section 2.1 or 2.2
CONFESSION_ID="f47ac10b-58cc-4372-a567-0e02b2c3d479"

curl -X GET "$BACKEND_URL/confessions/$CONFESSION_ID" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" | jq .
```

**Expected:** HTTP 200 with full confession detail

**Sample response:**
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "message": "I secretly enjoy watching reality TV shows.",
  "gender": "female",
  "tags": ["humor"],
  "view_count": 43,
  "created_at": "2026-04-25T10:00:00.000Z",
  "reactions": [
    { "emoji": "❤️", "count": 5 }
  ],
  "comments": []
}
```

### 3.2 Post Comment (Requires Authentication)
```bash
# Replace {confessionId} with an actual ID
CONFESSION_ID="f47ac10b-58cc-4372-a567-0e02b2c3d479"
# Replace {authToken} with a valid JWT token
AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X POST "$BACKEND_URL/confessions/$CONFESSION_ID/comments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "message": "Test comment from smoke test"
  }' \
  -w "\nStatus: %{http_code}\n" | jq .
```

**Expected:** HTTP 201 with comment object

---

## Section 4: Report Submission

### 4.1 Submit Report (Unauthenticated)
```bash
# Replace {confessionId} with an actual ID
CONFESSION_ID="f47ac10b-58cc-4372-a567-0e02b2c3d479"

curl -X POST "$BACKEND_URL/reports" \
  -H "Content-Type: application/json" \
  -d "{
    \"confessionId\": \"$CONFESSION_ID\",
    \"type\": \"offensive\",
    \"reason\": \"Contains hate speech (test report)\"
  }" \
  -w "\nStatus: %{http_code}\n" | jq .
```

**Expected:** HTTP 201 with report object

**Sample response:**
```json
{
  "id": "report-uuid-12345",
  "confessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "type": "offensive",
  "reason": "Contains hate speech (test report)",
  "status": "pending",
  "createdAt": "2026-05-29T10:00:00.000Z"
}
```

### 4.2 Test Other Report Types
```bash
# Test spam report
curl -X POST "$BACKEND_URL/reports" \
  -H "Content-Type: application/json" \
  -d "{
    \"confessionId\": \"$CONFESSION_ID\",
    \"type\": \"spam\",
    \"reason\": \"Duplicate post (test)\"
  }" \
  -w "\nStatus: %{http_code}\n" | jq .

# Test inappropriate report
curl -X POST "$BACKEND_URL/reports" \
  -H "Content-Type: application/json" \
  -d "{
    \"confessionId\": \"$CONFESSION_ID\",
    \"type\": \"inappropriate\",
    \"reason\": \"Sexually explicit (test)\"
  }" \
  -w "\nStatus: %{http_code}\n" | jq .

# Test other report
curl -X POST "$BACKEND_URL/reports" \
  -H "Content-Type: application/json" \
  -d "{
    \"confessionId\": \"$CONFESSION_ID\",
    \"type\": \"other\",
    \"reason\": \"Other issue (test)\"
  }" \
  -w "\nStatus: %{http_code}\n" | jq .
```

**Expected:** All return HTTP 201

---

## Section 5: Admin Routes - Notification Diagnostics

### 5.1 Access Without Authentication (Should Fail)
```bash
curl -X GET "$BACKEND_URL/diagnostics/notifications" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" | jq .
```

**Expected:** HTTP 401 or 403 (Unauthorized/Forbidden)

**Sample error response:**
```json
{
  "message": "Unauthorized",
  "statusCode": 401
}
```

### 5.2 Access With Invalid Token (Should Fail)
```bash
curl -X GET "$BACKEND_URL/diagnostics/notifications" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid.token.here" \
  -w "\nStatus: %{http_code}\n" | jq .
```

**Expected:** HTTP 401 (Unauthorized)

### 5.3 Access With Valid Admin Token (Should Pass)
```bash
# Replace {adminToken} with a valid JWT token for an admin user
ADMIN_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET "$BACKEND_URL/diagnostics/notifications" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -w "\nStatus: %{http_code}\n" | jq .
```

**Expected:** HTTP 200 with queue diagnostics

**Sample success response:**
```json
{
  "queueDepth": 5,
  "dlqDepth": 0,
  "activeJobs": 3,
  "completedJobs": 127,
  "failedJobs": 2,
  "delayedJobs": 1,
  "queues": [
    { "name": "notifications", "status": "active" },
    { "name": "notifications-dlq", "status": "active" }
  ]
}
```

---

## Frontend Testing (Manual in Browser)

### Login Page
```
Open: http://localhost:3000/auth/login
Expected: Login form, link to register, no errors
```

### Confession Feed (Protected)
```
Open: http://localhost:3000/
Prerequisites: Must be logged in
Expected: Confession cards, pagination, reactions, comments
```

### Confession Detail (Protected)
```
Open: http://localhost:3000/confessions/{confessionId}
Prerequisites: Must be logged in, confessionId must exist
Expected: Full confession, reactions, comments section
```

### Admin Dashboard (Protected + Admin)
```
Open: http://localhost:3000/admin/dashboard
Prerequisites: Must be logged in as admin
Expected: Admin panel, navigation, dashboard metrics
```

### Admin Reports (Protected + Admin)
```
Open: http://localhost:3000/admin/reports
Prerequisites: Must be logged in as admin
Expected: List of reports, filtering/search, action buttons
```

---

## Batch Testing Script

To run all curl tests at once:

```bash
#!/bin/bash

BACKEND_URL="http://localhost:5000"
export CONFESSION_ID=""

echo "=== Health Checks ==="
curl -s -X GET "$BACKEND_URL/" -H "Content-Type: application/json" | jq .

echo -e "\n=== Liveness ==="
curl -s -X GET "$BACKEND_URL/health/live" -H "Content-Type: application/json" | jq .

echo -e "\n=== Readiness ==="
curl -s -X GET "$BACKEND_URL/health/ready" -H "Content-Type: application/json" | jq .

echo -e "\n=== List Confessions ==="
confessions=$(curl -s -X GET "$BACKEND_URL/confessions?limit=1" -H "Content-Type: application/json")
echo "$confessions" | jq .
CONFESSION_ID=$(echo "$confessions" | jq -r '.data[0].id // empty')

if [ -n "$CONFESSION_ID" ]; then
  echo -e "\n=== Get Confession Detail (ID: $CONFESSION_ID) ==="
  curl -s -X GET "$BACKEND_URL/confessions/$CONFESSION_ID" -H "Content-Type: application/json" | jq .

  echo -e "\n=== Submit Report ==="
  curl -s -X POST "$BACKEND_URL/reports" \
    -H "Content-Type: application/json" \
    -d "{\"confessionId\":\"$CONFESSION_ID\",\"type\":\"offensive\",\"reason\":\"test\"}" | jq .
fi

echo -e "\n=== Admin Endpoint (No Auth - Should Fail) ==="
curl -s -X GET "$BACKEND_URL/diagnostics/notifications" -H "Content-Type: application/json" -w "\nStatus: %{http_code}\n"

echo -e "\n✓ Smoke test complete!"
```

---

## Troubleshooting

### Connection Refused
- Ensure backend is running: `npm run dev --workspace=xconfess-backend`
- Verify port 5000 is correct: `lsof -i :5000`

### Invalid JSON Responses
- Use `| jq .` to format responses
- Check backend logs for errors: `docker logs <container>`

### 401/403 on Authenticated Endpoints
- Ensure you have a valid JWT token
- Login via `POST /users/login` or `/auth/login` first
- Pass token in header: `Authorization: Bearer {token}`

### Database Errors
- Ensure Postgres is running: `docker ps | grep postgres`
- Verify database is seeded: Check via psql or frontend

### Missing Routes
- Run `npm run dev` from repo root to compile controllers
- Check OpenAPI docs: `http://localhost:5000/docs` (if available)

---

## Performance Baseline

Record these response times for regression detection:

| Endpoint | Method | Expected Time | Actual |
|----------|--------|---|---|
| `/` | GET | < 100ms | ___ |
| `/health/live` | GET | < 100ms | ___ |
| `/health/ready` | GET | < 500ms | ___ |
| `/confessions` | GET | < 500ms | ___ |
| `/confessions/:id` | GET | < 200ms | ___ |
| `/reports` | POST | < 500ms | ___ |

