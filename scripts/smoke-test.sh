#!/usr/bin/env bash
# scripts/smoke-test.sh
# Smoke test suite for xConfess covering core user journeys.
# Uses seeded local data (see scripts/seed.ts for credentials/IDs).
#
# Usage:
#   ./scripts/smoke-test.sh [--verbose]
#
# Environment variables:
#   BACKEND_URL   (default: http://localhost:5000)
#   FRONTEND_URL  (default: http://localhost:3000)
#   SEED_EMAIL    (default: seed_alice@example.com)
#   SEED_PASSWORD (default: password123)
#
# Exit codes:
#   0 — all critical flows passed
#   1 — one or more critical flows failed

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
BACKEND_URL="${BACKEND_URL:-http://localhost:5000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
SEED_EMAIL="${SEED_EMAIL:-seed_alice@example.com}"
SEED_PASSWORD="${SEED_PASSWORD:-password123}"
VERBOSE="${1:-}"

RESULTS_FILE="smoke-test-results.txt"
REQUESTS_LOG="smoke-test-requests.log"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Counters ──────────────────────────────────────────────────────────────────
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
CRITICAL_FAILED=0

# ── Helpers ───────────────────────────────────────────────────────────────────
log_section() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

log_pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  ((TESTS_PASSED++)) || true
}

log_fail() {
  local msg="$1" route="${2:-}" request_id="${3:-}"
  local detail=""
  [ -n "$route" ]      && detail+=" | route: $route"
  [ -n "$request_id" ] && detail+=" | requestId: $request_id"
  echo -e "${RED}✗ FAIL${NC}: $msg${detail}"
  ((TESTS_FAILED++)) || true
}

log_critical_fail() {
  log_fail "$@"
  ((CRITICAL_FAILED++)) || true
}

# Redact Authorization header values and bearer tokens from a string.
redact_tokens() {
  echo "$1" \
    | sed 's/Authorization: Bearer [^ ]*/Authorization: Bearer [REDACTED]/gi' \
    | sed 's/"token":"[^"]*"/"token":"[REDACTED]"/gi' \
    | sed 's/"accessToken":"[^"]*"/"accessToken":"[REDACTED]"/gi' \
    | sed 's/"sessionToken":"[^"]*"/"sessionToken":"[REDACTED]"/gi'
}

# Extract a JSON field value from a string (simple grep-based, no jq dependency hard requirement).
extract_json() {
  local json="$1" field="$2"
  echo "$json" | grep -oP "\"${field}\":\s*\"?\K[^,}\"]+" 2>/dev/null | head -1 || true
}

# Perform an HTTP request and test the result.
# Args: METHOD ENDPOINT EXPECTED_CODES DESCRIPTION [DATA] [EXTRA_HEADERS] [IS_CRITICAL]
# Sets globals: LAST_BODY LAST_CODE LAST_REQUEST_ID
LAST_BODY=""
LAST_CODE=""
LAST_REQUEST_ID=""

do_request() {
  local method="$1" endpoint="$2" expected_codes="$3" description="$4"
  local data="${5:-}" extra_headers="${6:-}" is_critical="${7:-false}"
  ((TESTS_RUN++)) || true

  local url="${BACKEND_URL}${endpoint}"
  local curl_args=(-s -w "\n%{http_code}" -X "$method" "$url"
                   -H "Content-Type: application/json"
                   -H "Accept: application/json")

  [ -n "$AUTH_COOKIE" ] && curl_args+=(-H "Cookie: $AUTH_COOKIE")
  [ -n "$data" ]        && curl_args+=(-d "$data")

  local raw
  raw=$(curl "${curl_args[@]}" 2>/dev/null) || true

  LAST_CODE=$(echo "$raw" | tail -n1)
  LAST_BODY=$(echo "$raw" | sed '$d')
  LAST_REQUEST_ID=$(extract_json "$LAST_BODY" "requestId")

  # Redact tokens before logging
  local safe_body
  safe_body=$(redact_tokens "$LAST_BODY")

  echo "[${method}] ${endpoint} → HTTP ${LAST_CODE}" >> "$REQUESTS_LOG"
  [ -n "$VERBOSE" ] && echo -e "  ${YELLOW}Response${NC}: $safe_body"

  if echo "$expected_codes" | grep -qw "$LAST_CODE"; then
    log_pass "$description (HTTP $LAST_CODE)"
    return 0
  else
    if [ "$is_critical" = "true" ]; then
      log_critical_fail "$description (HTTP $LAST_CODE, expected: $expected_codes)" "$endpoint" "$LAST_REQUEST_ID"
    else
      log_fail "$description (HTTP $LAST_CODE, expected: $expected_codes)" "$endpoint" "$LAST_REQUEST_ID"
    fi
    return 1
  fi
}

# ── Init logs ─────────────────────────────────────────────────────────────────
{
  echo "xConfess Smoke Test Results"
  echo "Generated: $(date)"
  echo "Backend:  $BACKEND_URL"
  echo "Frontend: $FRONTEND_URL"
  echo "========================================"
} > "$RESULTS_FILE"

{
  echo "# xConfess Smoke Test — API Request Log (tokens redacted)"
  echo "# Generated: $(date)"
} > "$REQUESTS_LOG"

echo -e "${GREEN}xConfess Smoke Test Suite${NC}"
echo "Backend:  $BACKEND_URL"
echo "Frontend: $FRONTEND_URL"

# Shared state across flows
AUTH_COOKIE=""
SESSION_USER_ID=""
CONFESSION_ID=""
COMMENT_ID=""

# ── SECTION 1: Health & Readiness ─────────────────────────────────────────────
log_section "1 · Health & Readiness"

do_request "GET" "/" "200" "Root endpoint"
do_request "GET" "/health/live" "200" "Liveness probe" "" "" "true"
do_request "GET" "/health/ready" "200 503" "Readiness probe"

# ── SECTION 2: Login / Session ────────────────────────────────────────────────
log_section "2 · Login / Session (critical)"

LOGIN_BODY="{\"email\":\"${SEED_EMAIL}\",\"password\":\"${SEED_PASSWORD}\"}"

((TESTS_RUN++)) || true
echo "[POST] /auth/login → (checking session)" >> "$REQUESTS_LOG"

RAW_LOGIN=$(curl -s -c /tmp/smoke_cookies.txt \
  -w "\n%{http_code}" \
  -X POST "${BACKEND_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_BODY" 2>/dev/null) || true

LOGIN_CODE=$(echo "$RAW_LOGIN" | tail -n1)
LOGIN_BODY_RESP=$(echo "$RAW_LOGIN" | sed '$d')
LOGIN_REQUEST_ID=$(extract_json "$LOGIN_BODY_RESP" "requestId")

if echo "200 201" | grep -qw "$LOGIN_CODE"; then
  log_pass "Login with seeded user (HTTP $LOGIN_CODE)"
  ((TESTS_PASSED++)) || true

  # Extract cookie for subsequent requests
  AUTH_COOKIE=$(grep -oP 'session\s+\K\S+' /tmp/smoke_cookies.txt 2>/dev/null \
    | head -1 | xargs -I{} echo "session={}" || true)

  # Also try token-based auth if cookie not found
  if [ -z "$AUTH_COOKIE" ]; then
    TOKEN=$(extract_json "$LOGIN_BODY_RESP" "accessToken")
    [ -n "$TOKEN" ] && AUTH_COOKIE="token=${TOKEN}"
  fi

  SESSION_USER_ID=$(extract_json "$LOGIN_BODY_RESP" "id")
else
  log_critical_fail "Login with seeded user (HTTP $LOGIN_CODE, expected: 200 201)" "/auth/login" "$LOGIN_REQUEST_ID"
  ((TESTS_FAILED++)) || true
  ((CRITICAL_FAILED++)) || true
fi

# Verify session is active
do_request "GET" "/auth/session" "200" "Session check after login" "" "" "true" || true

# ── SECTION 3: Confession Create ──────────────────────────────────────────────
log_section "3 · Confession Create (critical)"

CONFESSION_PAYLOAD='{"message":"Smoke test confession — core flow check","gender":"other","tags":["test"]}'
if do_request "POST" "/confessions" "201" "Create confession" "$CONFESSION_PAYLOAD" "" "true"; then
  CONFESSION_ID=$(extract_json "$LAST_BODY" "id")
fi

# Fallback: grab the first seeded confession if creation failed or returned no id
if [ -z "$CONFESSION_ID" ]; then
  FEED_RAW=$(curl -s "${BACKEND_URL}/confessions?limit=1" 2>/dev/null) || true
  CONFESSION_ID=$(echo "$FEED_RAW" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1 || true)
fi

do_request "GET" "/confessions?page=1&limit=10" "200" "List confessions feed" "" "" "true"

if [ -n "$CONFESSION_ID" ]; then
  do_request "GET" "/confessions/${CONFESSION_ID}" "200" "Fetch confession by id" "" "" "true"
fi

# ── SECTION 4: Comment ────────────────────────────────────────────────────────
log_section "4 · Comment (critical)"

if [ -n "$CONFESSION_ID" ]; then
  COMMENT_PAYLOAD='{"content":"Smoke test comment — core flow"}'
  # Try both known comment routes
  if do_request "POST" "/confessions/${CONFESSION_ID}/comments" "201" \
      "Post comment on confession" "$COMMENT_PAYLOAD" "" "true"; then
    COMMENT_ID=$(extract_json "$LAST_BODY" "id")
  elif do_request "POST" "/comments" "201" \
      "Post comment (alt route)" \
      "{\"content\":\"Smoke test comment\",\"confessionId\":\"${CONFESSION_ID}\"}" "" "true"; then
    COMMENT_ID=$(extract_json "$LAST_BODY" "id")
  fi
else
  log_critical_fail "Post comment — skipped (no confession id)" "/confessions/:id/comments"
fi

# ── SECTION 5: Reaction ───────────────────────────────────────────────────────
log_section "5 · Reaction"

if [ -n "$CONFESSION_ID" ]; then
  REACTION_PAYLOAD="{\"emoji\":\"❤️\",\"confessionId\":\"${CONFESSION_ID}\"}"
  do_request "POST" "/reactions" "201 200" "Add reaction to confession" "$REACTION_PAYLOAD" || true

  # Alt route pattern
  if [ "${LAST_CODE}" != "201" ] && [ "${LAST_CODE}" != "200" ]; then
    do_request "POST" "/confessions/${CONFESSION_ID}/reactions" "201 200" \
      "Add reaction (alt route)" "{\"emoji\":\"❤️\"}" || true
  fi
else
  log_fail "Add reaction — skipped (no confession id)" "/reactions"
fi

# ── SECTION 6: Report ─────────────────────────────────────────────────────────
log_section "6 · Report (critical)"

if [ -n "$CONFESSION_ID" ]; then
  REPORT_PAYLOAD="{\"confessionId\":\"${CONFESSION_ID}\",\"type\":\"spam\",\"reason\":\"Smoke test report\"}"
  do_request "POST" "/reports" "201 200" "Submit report on confession" "$REPORT_PAYLOAD" "" "true"
else
  log_critical_fail "Submit report — skipped (no confession id)" "/reports"
fi

# ── SECTION 7: Auth-protected routes reject unauthenticated ───────────────────
log_section "7 · Auth Guard"

# Temporarily clear cookie to test guard
SAVED_COOKIE="$AUTH_COOKIE"
AUTH_COOKIE=""
do_request "GET" "/diagnostics/notifications" "401 403" "Admin endpoint rejects anonymous request"
AUTH_COOKIE="$SAVED_COOKIE"

# ── SECTION 8: Frontend availability ──────────────────────────────────────────
log_section "8 · Frontend"

((TESTS_RUN++)) || true
FE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${FRONTEND_URL}/" 2>/dev/null) || FE_CODE=""
if [ "$FE_CODE" = "200" ]; then
  log_pass "Frontend homepage (HTTP $FE_CODE)"
  ((TESTS_PASSED++)) || true
else
  log_fail "Frontend homepage (HTTP $FE_CODE)" "/"
fi

# ── Results ───────────────────────────────────────────────────────────────────
log_section "Results"

PASS_RATE=0
[ "$TESTS_RUN" -gt 0 ] && PASS_RATE=$(( TESTS_PASSED * 100 / TESTS_RUN ))

echo "Tests run:    $TESTS_RUN"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
echo "Pass rate:    ${PASS_RATE}%"
[ "$CRITICAL_FAILED" -gt 0 ] && echo -e "${RED}Critical failures: $CRITICAL_FAILED${NC}"

{
  echo ""
  echo "Tests run: $TESTS_RUN"
  echo "Passed:    $TESTS_PASSED"
  echo "Failed:    $TESTS_FAILED"
  echo "Pass rate: ${PASS_RATE}%"
  echo "Critical:  $CRITICAL_FAILED"
} >> "$RESULTS_FILE"

echo ""
echo "Results: $RESULTS_FILE"
echo "Requests log (tokens redacted): $REQUESTS_LOG"

rm -f /tmp/smoke_cookies.txt

if [ "$CRITICAL_FAILED" -gt 0 ]; then
  echo -e "${RED}SMOKE FAILED — $CRITICAL_FAILED critical flow(s) failed.${NC}"
  exit 1
fi

if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "${YELLOW}SMOKE PASSED with $TESTS_FAILED non-critical failure(s).${NC}"
  exit 0
fi

echo -e "${GREEN}SMOKE PASSED — all flows nominal.${NC}"
exit 0
