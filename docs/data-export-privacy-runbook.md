# Data Export Privacy & Legal Response Runbook
This runbook documents how the team handles user data export requests during normal operations and incident response. It ensures privacy requests are handled consistently, securely, and defensibly, with clear guidelines for engineering, support, and compliance teams.

## 1. Normal Operations (Happy Path)

### Request Intake
- **Rate Limiting:** Users can request exactly **one** export every 7 days.
- **State Machine:** Requests follow a strict timeline: `PENDING` -> `PROCESSING` -> `READY`(/ `PROCESSING` -> `FAILED`) -> `EXPIRED`.
- **Initial Audit Event:** Upon request creation, the `auditLogService` logs a `request_created` event binding the user ID to the request ID.

### Generation & Processing
- The background `export-queue` (Bull) picks up the `PENDING`job, marking it `PROCESSING`.
- Service compiles the user's confessions, messages, reactions, etc., and generates CSVs or zipped chunks.
- Upon completion, the status changes to `READY`, and a `generation_completed` audit event is logged by the system.

### Delivery & Expiry
- **Secure Download Links:** The system generates signed, expiring URLs (`generateSignedDownloadUrl`) using HMAC SHA-256 for the delivery of the export payload.
- **Link Expiration:** Download links are strictly valid for **24 hours** from generation. 
- **Time Window Expiration:** Once the 24-hour window passes, the link expires and the request state is treated as `EXPIRED`. Users must wait until the original 7-day rate limit ends to request a new export link, to mitigate ongoing exposure risks.
- **Download Audit:** Every time the payload is fetched, a `downloaded` event is generated for tracking access.

---

## 2. Incident Response
If an operational anomaly or security violation occurs regarding an export, follow the steps below.

### Scenario A: Failed Exports (Processing Error)
**Detection:** The user's job enters the `FAILED` state.
**Action Plan (Support / Engineering):**
1. Check the `lastFailureReason` on the request item in the database or admin dashboard. 
2. Verify if the failure is temporary (e.g., database timeout) or systemic (e.g., malformed user data crashing the compiler).
3. If systemic, Engineering must patch the export generation service.
4. Support can manually clear the rate limit by deleting the failed `ExportRequest` record, allowing the user to request a fresh export immediately.

### Scenario B: Leaked Links (Security Incident)
**Detection:** A user reports their signed download URL was leaked, or threat intel flags the link on a public venue.
**Action Plan (Security / Engineering):**
1. **Immediate Revocation (Targeted):** The leaked link cannot be natively revoked before its 24-hr expiry unless the underlying `appSecret` or request ID is invalidated. Immediately delete the `ExportRequest` and associated `ExportChunk` items from the database. This causes future requests to return `404 Not Found`.
2. **Review Audit Logs:** Query `auditLogService.logExportLifecycleEvent` for action `downloaded` associated with the request ID. Determine if the payload was successfully downloaded by an unauthorized actor.
3. **Escalation:** If evidence of unauthorized download exists, escalate to the Legal & Privacy team for formal breach notification procedures.

### Scenario C: Mistaken Account Matching (Privacy Incident)
**Detection:** A user reports that their downloaded export contains messages or data belonging to someone else.
**Action Plan (Privacy / Engineering):**
1. **Containment:** Immediately delete the affected `ExportRequest` and its chunks from the database/S3 to invalidate the link.
2. **Account Lock:** Temporarily lock the affected account configurations to prevent further generation while investigating the cross-contamination.
3. **Investigation:** Engineering must investigate the TypeORM queries in `data-export.service.ts` to identify the authorization leak boundary.
4. **Notification:** Legal & Privacy team must be engaged immediately. Identify the true owner of the erroneously exposed data and follow regulatory notification requirements (e.g., GDPR 72-hour notification).
5. **Recovery:** Once fixed, offer the users a managed, verified export run by Support.

---

## 3. Compliance and Audit Evidence
During a compliance review or regulatory inquiry, the engineering team must provide the following evidence from the `auditLogService`:

- **Who & When (Intake):** Provide logs with action `request_created` filtering by timestamp and actor ID.
- **Integrity (Processing):** Provide `generation_completed` logs showing successful compilation by the system.
- **Access Logs (Delivery):** Provide `link_refreshed` and `downloaded` logs showing exactly when, and potentially from what IP/user agent (if stored in metadata), the data was downloaded.

*All Support and Engineering personnel must rely on these immutable audit events over user claims when verifying account data timelines.*

## 4. Related Documentation

- [Data Export Retention, Expiry, and Deletion Lifecycle](data-export-retention.md) — Comprehensive technical reference for lifecycle states, download tokens, 7-day cooldowns, and scheduled cleanup.


## 4. Request Lifecycle
The export workflow is divided across three components: the API, the queue, and the generated artifacts.

### API
The API is the only entry point for export requests. It is responsible for authenticating the caller, enforcing the 7-day rate limit, creating the `ExportRequest` record in the `PENDING` state, and enqueuing the generation job. The API also serves the status endpoint and issues signed download URLs once a request reaches `READY`. It must not perform export compilation inline; doing so blocks the request thread and bypasses the audit trail.

### Queue
The queue is the asynchronous worker that drives the state machine. It is responsible for transitioning a request from `PENDING` to `PROCESSING`, running the compilation logic, and transitioning to `READY` or `FAILED`. The queue must be idempotent: a retried job must not duplicate artifacts or audit events. Failures must record a `lastFailureReason` and leave the request in `FAILED` rather than `READY`.

### Generated Artifacts
Generated artifacts are the per-request export payloads: CSV files or zipped chunks stored in the configured bucket and referenced by `ExportChunk` records. They are immutable once written, scoped to a single request ID, and must never be shared across requests. Access is only through signed URLs issued by the API.

### Lifecycle Summary
1. Client calls the API to request an export.
2. API authenticates, enforces the rate limit, creates an `ExportRequest` in `PENDING`, and enqueues the job.
3. Queue worker picks up the job, moves the request to `PROCESSING`, and compiles the artifacts.
4. On success, the queue moves the request to `READY` and logs `generation_completed`. On failure, it moves to `FAILED` with a `lastFailureReason`.
5. Client polls the API for status, then requests a signed download URL for a `READY` request.
6. Client downloads the artifacts within the 24-hour window. After the window, the request is treated as `EXPIRED`.

### Local Testing
Run the export workflow locally without hitting production by following these steps:

1. Start the API and the queue worker against a local database and local bucket.
2. Authenticate as a test user and create an export request through the API.
3. Confirm the request is created in `PENDING` and that a `request_created` audit event is written.
4. Allow the queue worker to process the job and verify the request transitions to `READY` with a `generation_completed` event.
5. Request a signed download URL and confirm the download succeeds and logs a `downloaded` event.
6. Exercise the failure path by injecting a compilation error and confirming the request ends in `FAILED` with a populated `lastFailureReason`.

### Cleanup Expectations
Cleanup is part of the workflow, not an afterthought. The following expectations apply:

- When a request expires or is invalidated, delete the `ExportRequest` record and all associated `ExportChunk` records and bucket objects.
- Never leave orphaned artifacts in the bucket after the request record is removed.
- Ensure cleanup is idempotent: running it twice must not error or affect other requests.
- Audit events for a request are retained according to the retention policy even after the artifacts are deleted.
- Cleanup must not delete artifacts for requests that are still in `REEADY` within their valid 24-hour window.

### Privacy-Safe Handling Guidance
Treat export payloads and their metadata as sensitive user data at all times:

- Never log raw export contents, file names containing user data, or signed URLs to application logs.
- Scope every database query to the authenticated user ID; never rely on client-supplied identifiers alone.
- Use short-lived signed URLs and avoid storing them in tickets, chat, or third-party tools.
- Restrict bucket access to the export service identity only; no broad human read access.
- When debugging, replace payload contents with structural metadata (row counts, column names) rather than raw values.
- Restrict access to audit logs to authorized personnel and redact metadata that could identify a third party.
- Report any suspected cross-user exposure immediately through the incident response process above.
