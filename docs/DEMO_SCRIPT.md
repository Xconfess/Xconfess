# Wave 5 Demo Script

This script guides maintainers and contributors through the core XConfess flows
for a consistent Wave 5 demo. Each section lists the steps to perform and the
screenshots or short clips to capture.

## Prerequisites

- PostgreSQL and Redis are running via `compose.yaml` (default ports 55432, 6379).
- Backend is running at `http://localhost:5000`.
- Frontend is running at `http://localhost:3000`.

## 0. Full-Stack Smoke Test

Before running through the demo, verify both services are reachable:

```bash
./scripts/smoke-test.sh
```

The script checks:

- Backend liveness at `GET /health/live`
- Frontend root route returns HTML
- Exits zero only when all checks pass

Run it any time to confirm the stack is up:

```bash
BACKEND_URL=http://localhost:5000 FRONTEND_URL=http://localhost:3000 ./scripts/smoke-test.sh
```

---

## Demo Walkthrough

### Setup Assumptions

- At least one admin user and one regular user exist in the local database.
- A browser is logged in as the regular user for sections 1-2 and as the admin
  for sections 3-4.
- Stellar testnet credentials are configured in `xconfess-backend/.env` if
  section 4 is demonstrated.
- Local demo data has been prepared with
  [`local-demo-data-seed-guide.md`](./local-demo-data-seed-guide.md).

---

## 1. Confession Creation

### Steps

1. Navigate to `http://localhost:3000`.
2. Click **"+ New Confession"** or the composer CTA.
3. Type a confession message and optionally add tags.
4. Submit the confession.
5. Verify the confession appears immediately in the feed.

### Screenshots / Clips

| #   | What to capture                           |
| --- | ----------------------------------------- |
| 1   | Composer form with a filled message       |
| 2   | Feed showing the newly created confession |

---

## 2. Feed Engagement

### Steps

1. From the feed, click the **like / react** button on a confession.
2. Add a **comment** to a confession.
3. Verify the reaction count and comment appear in real time.
4. Use the **search** bar to find a confession by keyword.
5. Click into a confession to view its **detail page**.

### Screenshots / Clips

| #   | What to capture                               |
| --- | --------------------------------------------- |
| 1   | Feed with visible reactions and comment count |
| 2   | Comment thread below a confession             |
| 3   | Search results for a keyword                  |
| 4   | Confession detail page                        |

---

## 3. Report and Admin Review

### Steps

1. While logged in as a regular user, **report** a confession (choose a reason).
2. Log out and log in as an **admin user**.
3. Navigate to the **Admin Dashboard** at `/admin/dashboard`.
4. Open the **Reports** page at `/admin/reports`.
5. Locate the report created in step 1.
6. Click **View** to see the report detail.
7. **Resolve** or **dismiss** the report.
8. Verify the audit log captures the action at `/admin/audit-logs`.

### Screenshots / Clips

| #   | What to capture                               |
| --- | --------------------------------------------- |
| 1   | Report submission confirmation (user view)    |
| 2   | Admin Reports page showing the pending report |
| 3   | Report detail with confession context         |
| 4   | Report after resolution (status change)       |
| 5   | Audit log entry for the resolution            |

---

## 4. Stellar Flow — Confession Anchoring

### Steps

1. Log in as a regular user.
2. Open the detail page of a confession.
3. Click **"Anchor to Stellar"** (or similar CTA).
4. Confirm the wallet connection via Freighter.
5. Wait for the anchoring transaction to complete.
6. Verify the anchored badge or transaction reference appears on the confession.

### Screenshots / Clips

| #   | What to capture                                    |
| --- | -------------------------------------------------- |
| 1   | Confession detail before anchoring                 |
| 2   | Wallet connection / signing prompt                 |
| 3   | Confession detail after anchoring (success state)  |
| 4   | Optional: Stellar explorer URL for the transaction |

---

## Checklist Summary

- [ ] Section 0 — Smoke test passes (run `./scripts/smoke-test.sh`)
- [ ] Section 1 screenshots captured (composer + feed)
- [ ] Section 2 screenshots captured (reactions, comments, search, detail)
- [ ] Section 3 screenshots captured (report, admin review, audit log)
- [ ] Section 4 screenshots captured (anchoring flow)
- [ ] All images are named clearly (e.g. `section-1-composer.png`)
