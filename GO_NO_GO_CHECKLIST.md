# XConfess — Go/No-Go Checklist

Use before any demo or review cycle. Check off each item; anything unchecked
in **Key Flows** or **Known Risks** is a blocker unless explicitly waived..

---

## 1. Boot

- [ ] `rustc --version` ≥ 1.81, `stellar --version` ≥ 22.0.0, Node ≥ 18
- [ ] `npm install` from monorepo root completes clean (resolves
      `xconfess-backend` + `xconfess-contracts` workspaces)
- [ ] `./scripts/contracts-preflight.sh --deploy` passes (checks key, network,
      Stellar CLI in one shot)
- [ ] Backend boots: readiness health check (`*-readiness.health.ts`) and
      Redis health check (`redis.health.ts`) both report healthy
- [ ] `.env` / `.env.sample` reviewed — `CONTRACT_ID`, `STELLAR_NETWORK`,
      `STELLAR_RPC_URL` set and pointed at the intended network (testnet vs
      mainnet — confirm this explicitly, don't assume)
- [ ] Frontend dev server starts without console errors (check
      `offline/page.tsx`, `WebSocketReconnectBanner`, service worker
      registration via `public/sw.js` — these fail silently if misconfigured)
,
## 2. Build

- [ ] `./scripts/contracts-release.sh build` succeeds and produces all four
      `.wasm` artifacts:
      `confession_anchor`, `confession_registry`, `reputation_badges`,
      `anonymous_tipping`
- [ ] `deployments/contract-wasm-manifest.json` generated with SHA-256 hashes
      matching the build just run (stale manifest = red flag)
- [ ] `npm run contract:lint` clean (warnings are errors in this repo — no
      `#[allow(...)]` escape hatches permitted)
- [ ] `npm run contract:fmt:check` clean

## 3. Smoke Tests

- [ ] `cargo test` — full contract suite passes for all four contracts
      (`cargo test -p confession-anchor`, `-p confession-registry`,
      `-p reputation-badges`, `-p anonymous-tipping`)
- [ ] `./scripts/test-contracts.sh` (canonical contract test script) passes
- [ ] E2E suite (`xconfess-backend/e2e/`) passes: `auth.spec.ts`,
      `confession.spec.ts`, `interaction.spec.ts`, `mobile.spec.ts`,
      `stellar.spec.ts`
- [ ] Frontend E2E smoke: `tests/e2e/core-flows-smoke.spec.ts` passes
- [ ] Frontend E2E journey: `tests/e2e/confession-engagement-journey.spec.ts`
      passes
- [ ] `tests/auth/admin-route-authorization.spec.tsx` and
      `tests/auth/session-expired-banner.spec.tsx` pass (auth edge cases are
      an easy thing to break silently)
- [ ] If deploying: post-deployment `get_version()` invoke succeeds against
      each of the four deployed contract IDs

## 4. Key Flows (manual or scripted walk-through)

- [ ] **Confession anchoring** — submit a confession, confirm on-chain
      anchor call succeeds, confirm hash/commitment appears in
      `deployments/<network>.json`-referenced contract state
- [ ] **Confession verification** — re-verify an anchored confession returns
      the correct timestamp/commitment; duplicate submission is correctly
      rejected or handled per current scheme (see Risk #1 below)
- [ ] **Reputation badges** — both paths work end-to-end per Issue #574:
  - [ ] Admin path: `create_badge` → `award_badge` → `has_badge` returns true
  - [ ] Self-service path: `mint_badge` → `has_badge` returns true
  - [ ] Duplicate-badge prevention fires on both paths
  - [ ] `adjust_reputation` reflects in `get_user_reputation` (test both
        positive and negative amounts)
- [ ] **Anonymous tipping** — flow completes without requiring any admin
      role (contract is intentionally decentralized — confirm no auth gate
      was accidentally introduced)
- [ ] **Messaging / E2E encryption** — `useMessageE2E` hook and
      `messageE2E.ts` / `messageKeyStore.ts` round-trip correctly (encrypt on
      one client, decrypt on other)
- [ ] **WebSocket reconnect** — kill and restore backend connection, confirm
      `WebSocketReconnectBanner` displays and `useWebSocket` reconnects
      without losing session state
- [ ] **Offline handling** — airplane-mode test against `offline/page.tsx`
      and `syncQueue.ts`; confirm queued actions sync once back online
- [ ] **Mobile flows** — `mobile.spec.ts` scenarios pass on a real device or
      responsive emulation, not just desktop viewport

## 5. Known Risks (confirm status before demo — do not assume "still fine")

- [ ] **Doc/implementation drift on ConfessionAnchor.** README describes a
      plain-hash anchoring scheme (`get_confession_count`,
      `verify_confession(hash) → Option<timestamp>`), but
      `confession_anchor.rs` (Issue #1343) implements a **Pedersen
      commitment scheme** (`commitment = SHA-256(content || blinding_factor)`,
      ephemeral pubkeys, no session/user/IP linkage). Confirm which API
      surface is actually live before the backend or demo script calls it —
      function signatures may not match the README anymore.
- [ ] **Mainnet vs testnet confusion.** Mainnet deploys require the same
      commit already verified on testnet plus signed-off approvals per the
      mainnet safety gate in `contract-release-and-upgrade-runbook.md`. Don't
      demo against mainnet unless this gate was actually completed.
- [ ] **Contract pause state.** If any contract has `pause`/`unpause`
      (ConfessionAnchor does), confirm it isn't left paused from a prior
      test/incident before the demo.
- [ ] **Admin key custody.** Confirm whoever is running the demo has the
      correct deployer/admin key alias loaded — wrong key looks like a
      contract bug but is actually an auth mismatch.
- [ ] **Version/capability mismatch.** Use `get_version()` and
      `get_capabilities()` to confirm the deployed WASM matches what the
      backend/frontend expect (`event_schema_version`,
      `error_registry_version`) — silent skew here causes confusing event
      parsing failures downstream.
- [ ] **Redis dependency.** If Redis is down or misconfigured, confirm what
      degrades gracefully vs what hard-fails (check `redis.health.ts`
      behavior under simulated outage).
- [ ] **Stale test-results artifact.** `test-results/.last-run.json` was
      recently deleted per terminal history — make sure CI regenerates it
      rather than the demo relying on a cached/stale run.

## 6. Go/No-Go Call

- [ ] All Boot + Build + Smoke Test items checked
- [ ] All Key Flows checked, or explicitly descoped with reviewer sign-off
- [ ] Every Known Risk either resolved or consciously accepted with a named
      owner
- [ ] Rollback plan confirmed (previous `deployments/<network>.json` on hand)

**Decision:** ☐ GO ☐ NO-GO ☐ GO WITH CAVEATS (list below)

_Caveats / waived items:_
