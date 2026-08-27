# Realtime Degradation and Incident Triage Playbook

## 1. Overview
This playbook provides triage steps, diagnostics, and degraded-mode responses for realtime (WebSocket) incidents impacting the xConfess backend. It ensures operators can identify failure modes and apply safe fallbacks without completely disrupting the platform.

## 2. Incident Triage Steps

### 2.1 Subscription Authorization Failures
**Symptoms:** 
- Surges in 401/403 errors during WebSocket handshake.
- High drop rate for `/reactions` or other protected namespaces.
- Clients repeatedly attempting to reconnect and failing immediately.

**Triage:**
1. **Verify Auth Service:** Check the health of the JWT/authentication service. Are REST API logins also failing?
2. **Token Expiry Validation:** Confirm if the issue is isolated to expired tokens not being refreshed vs. active tokens being rejected.
3. **Logs to Check:** Look for `WS_AUTH_FAILED` or `Error: Unauthorized` in backend logs.
4. **Resolution/Mitigation:** 
   - Temporarily scale up auth validation instances if the issue is load-related.
   - If a specific library or key rotation caused the failure, rollback the recent deployment.

### 2.2 Reconnect Storms
**Symptoms:**
- Massive spikes in concurrent connection attempts.
- Backend CPU/memory exhaustion due to TLS handshake and connection state overhead.
- Redis pub/sub latency increases.

**Triage:**
1. **Identify Trigger:** Did a load balancer drop connections? Was there a brief backend outage?
2. **Metrics:** Monitor `/websocket/stats` for concurrent connections, connection rate per second, and CPU usage.
3. **Resolution/Mitigation:**
   - **Rate Limiting:** Ensure connection rate limiting is active at the load balancer (e.g., Nginx, HAProxy) or API Gateway.
   - **Backoff Validation:** Verify front-end clients are using randomized exponential backoff for reconsidering connections.
   - **Scale Out:** Rapidly provision additional WebSocket gateway pods.

### 2.3 Stale Event Fanout
**Symptoms:**
- Users report missing or severely delayed emoji reactions or notifications.
- Redis pub/sub queue build-up.
- High memory usage on WebSocket nodes resulting from queued outgoing messages.

**Triage:**
1. **Check Redis:** Verify Redis health, memory usage, and CPU. High CPU in Redis might delay fanout.
2. **Gateway Health:** Check the `/websocket/health` and `/websocket/stats` endpoints for unusual connection counts or blocked event loops.
3. **Resolution/Mitigation:**
   - Restart affected WebSocket pods to clear hung state (rolling restart).
   - If Redis is a bottleneck, verify if the Redis instance needs vertical scaling.

## 3. Safe Degraded-Mode Responses

If the realtime system cannot be stabilized quickly, implement these degraded modes to protect core product safety:

### 3.1 Admin Queue
- **Degraded Action:** Disable real-time WebSocket updates for the admin queue.
- **Fallback:** Switch the admin dashboard to rely exclusively on REST API polling (e.g., every 15-30 seconds). This ensures moderators can still review and action reports without relying on failing WS connections.

### 3.2 Notification Features
- **Degraded Action:** Turn off live notification fanout (e.g., "User X replied to your confession").
- **Fallback:** Rely on users fetching their notification inbox via REST on page load or manual refresh. This drops non-essential realtime load and preserves baseline application capability.

## 4. Evidence to Collect for Escalation

When escalating a realtime incident to engineering, ensure the following is explicitly collected and actionable:

### 4.1 Logs & Metrics
- **WebSocket Gateway Logs:** Export the last 15-30 minutes of logs from WebSocket gateway pods (grep for `disconnect`, `exception`, `unauthorized`).
- **Connection Metrics:** Snapshots of connection count and connection rate from `/websocket/stats` or monitoring tools (e.g., Datadog, Grafana).
- **Node Health:** Memory and Event Loop lag metrics for the NestJS backend pods via `/websocket/health`.
- **Redis Metrics:** Memory usage, connected clients, pub/sub channels count.

### 4.2 Reproduction Steps
- **Client End:** Provide exact browser/client behavior (e.g., "Client receives 101 Switching Protocols but disconnects after 2 seconds").
- **Auth Token:** A sanitized or test token used during the failure (if debugging auth failures).
- **Environment Details:** Which environment (Prod/Staging), time of incident start, and any known recent deployments.
