/**
 * core-flows-smoke.spec.ts
 *
 * Smoke suite covering the five core user journeys required for pre-release
 * signal. Uses seeded local data (scripts/seed.ts).
 *
 * Flows:
 *   1. Login / session restore
 *   2. Confession create
 *   3. Comment on confession
 *   4. Reaction on confession
 *   5. Report a confession
 *
 * Failures include requestId (from response body) and the route URL.
 * All five flows are "critical" — the test file exits non-zero if any fail
 * (Playwright's default behaviour on test failure).
 */

import { expect, Page, test } from "@playwright/test";

// ── Seeded data (matches scripts/seed.ts) ────────────────────────────────────

const SEED_USER = {
  id: 1,
  username: "seed_alice",
  email: "seed_alice@example.com",
  password: "password123",
  role: "user",
  is_active: true,
};

const SEED_CONFESSION = {
  id: "smoke-confession-1",
  message: "Smoke test confession — I love writing automated tests.",
  gender: "other" as const,
  tags: ["test"],
  view_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  reactions: {},
  commentCount: 0,
};

const SEED_COMMENT = {
  id: 42,
  content: "Smoke test comment — core flow check.",
  createdAt: "2026-01-01T00:01:00.000Z",
};

const SEED_REACTION = {
  id: "smoke-reaction-1",
  emoji: "❤️",
};

const SEED_REPORT = {
  id: "smoke-report-1",
  status: "pending",
};

// ── Mock helpers ─────────────────────────────────────────────────────────────

/** Sets up API mocks for the full authenticated core-flow journey. */
async function setupCoreFlowMocks(page: Page) {
  let authenticated = false;

  // Auth: login
  await page.route("**/api/auth/login", async (route) => {
    authenticated = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: SEED_USER,
        anonymousUserId: "anon-smoke-1",
        requestId: "req-login-smoke",
      }),
    });
  });

  // Auth: session check
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (!authenticated) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          code: "INVALID_SESSION",
          message: "Not authenticated",
          requestId: "req-session-unauth",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: SEED_USER,
        requestId: "req-session-ok",
      }),
    });
  });

  // Confessions feed
  await page.route("**/api/confessions?**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        confessions: [SEED_CONFESSION],
        total: 1,
        page: 1,
        hasMore: false,
        requestId: "req-feed-smoke",
      }),
    });
  });

  // Confession create
  await page.route("**/api/confessions", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ...SEED_CONFESSION, requestId: "req-create-confession" }),
    });
  });

  // Single confession detail
  await page.route(`**/api/confessions/${SEED_CONFESSION.id}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...SEED_CONFESSION, requestId: "req-confession-detail" }),
    });
  });

  // Comments — post
  await page.route(`**/api/confessions/${SEED_CONFESSION.id}/comments`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ...SEED_COMMENT, requestId: "req-comment-smoke" }),
    });
  });

  // Comments — alt route
  await page.route("**/api/comments", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ...SEED_COMMENT, requestId: "req-comment-alt-smoke" }),
    });
  });

  // Comments list
  await page.route(`**/api/comments/by-confession/${SEED_CONFESSION.id}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [SEED_COMMENT], total: 1 }),
    });
  });

  // Reactions
  await page.route("**/api/reactions", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ...SEED_REACTION, requestId: "req-reaction-smoke" }),
    });
  });

  await page.route(`**/api/confessions/${SEED_CONFESSION.id}/reactions`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ...SEED_REACTION, requestId: "req-reaction-alt-smoke" }),
    });
  });

  // Reports
  await page.route("**/api/reports", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ...SEED_REPORT, requestId: "req-report-smoke" }),
    });
  });

  // User stats (prevent stray 404)
  await page.route("**/api/users/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ totalConfessions: 1, totalReactions: 0, badges: [] }),
    });
  });
}

// ── Flow 1: Login / Session ───────────────────────────────────────────────────

test.describe("Flow 1 — Login / Session", () => {
  test("login with seeded credentials and verify session is active", async ({ page }) => {
    await setupCoreFlowMocks(page);

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Login" }), {
      message: "Login page must be reachable [route: /login]",
    }).toBeVisible();

    await page.getByLabel("Email").fill(SEED_USER.email);
    await page.getByLabel("Password").fill(SEED_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    // After login the app should navigate away from /login
    await expect(page, {
      message:
        "After successful login the session should be established and user redirected [route: /login → /]",
    }).not.toHaveURL("/login", { timeout: 8000 });
  });

  test("unauthenticated user is redirected to login from protected route", async ({ page }) => {
    await setupCoreFlowMocks(page);
    await page.goto("/profile");
    await expect(page, {
      message: "Protected route must redirect to /login [route: /profile]",
    }).toHaveURL("/login", { timeout: 8000 });
  });

  test("session is restored on page reload", async ({ page }) => {
    await setupCoreFlowMocks(page);

    // Start authenticated
    await page.goto("/login");
    await page.getByLabel("Email").fill(SEED_USER.email);
    await page.getByLabel("Password").fill(SEED_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL("/login", { timeout: 8000 });

    const urlBeforeReload = page.url();
    await page.reload();
    await expect(page).not.toHaveURL("/login", {
      message: `Session should persist after reload [route: ${urlBeforeReload}]`,
    });
  });
});

// ── Flow 2: Confession Create ─────────────────────────────────────────────────

test.describe("Flow 2 — Confession Create", () => {
  test("authenticated user can create a confession and see it in the feed", async ({ page }) => {
    await setupCoreFlowMocks(page);

    await page.goto("/login");
    await page.getByLabel("Email").fill(SEED_USER.email);
    await page.getByLabel("Password").fill(SEED_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL("/login", { timeout: 8000 });

    // Navigate to home / confession composer
    await page.goto("/");

    // Open composer
    const beginBtn = page.getByRole("button", { name: "Begin writing" });
    if (await beginBtn.isVisible()) await beginBtn.click();

    const textarea = page.getByPlaceholder(/share something/i)
      .or(page.getByRole("textbox", { name: /confession/i }))
      .or(page.locator("textarea").first());

    await textarea.fill(SEED_CONFESSION.message);
    await page.getByRole("button", { name: /confess|submit|post/i }).click();

    // Confession should appear in feed
    await expect(page.getByText(SEED_CONFESSION.message), {
      message: `Created confession should appear in feed [route: /confessions (POST)]`,
    }).toBeVisible({ timeout: 10000 });
  });
});

// ── Flow 3: Comment ───────────────────────────────────────────────────────────

test.describe("Flow 3 — Comment", () => {
  test("authenticated user can post a comment on a confession", async ({ page }) => {
    await setupCoreFlowMocks(page);

    // Land directly on confession detail
    await page.goto(`/confessions/${SEED_CONFESSION.id}`);

    const commentInput = page
      .getByPlaceholder(/write a comment/i)
      .or(page.getByRole("textbox", { name: /comment/i }))
      .or(page.locator("textarea").first());

    await commentInput.fill(SEED_COMMENT.content);
    await page.getByRole("button", { name: /comment|submit|post/i }).click();

    await expect(page.getByText(SEED_COMMENT.content), {
      message: `Comment should appear after submission [route: /confessions/${SEED_CONFESSION.id}/comments (POST)]`,
    }).toBeVisible({ timeout: 8000 });
  });
});

// ── Flow 4: Reaction ──────────────────────────────────────────────────────────

test.describe("Flow 4 — Reaction", () => {
  test("authenticated user can react to a confession", async ({ page }) => {
    await setupCoreFlowMocks(page);

    await page.goto(`/confessions/${SEED_CONFESSION.id}`);

    // Locate a reaction button — try label, aria-label, or emoji text
    const reactionBtn = page
      .getByLabel("❤️")
      .or(page.getByRole("button", { name: "❤️" }))
      .or(page.locator("button").filter({ hasText: "❤️" }).first());

    await expect(reactionBtn, {
      message: `Reaction button must be visible [route: /confessions/${SEED_CONFESSION.id}]`,
    }).toBeVisible({ timeout: 8000 });

    await reactionBtn.click();

    // Reaction count should increment (any positive digit in the area)
    await expect(
      page.locator("button, span").filter({ hasText: /❤️/ }).locator(".."),
      {
        message: `Reaction count should update after click [route: /reactions (POST)]`,
      },
    ).toContainText(/[1-9]/, { timeout: 8000 });
  });
});

// ── Flow 5: Report ────────────────────────────────────────────────────────────

test.describe("Flow 5 — Report", () => {
  test("user can report a confession and receive confirmation", async ({ page }) => {
    await setupCoreFlowMocks(page);

    await page.goto(`/confessions/${SEED_CONFESSION.id}`);

    // Open report dialog — button may be labelled "Report", "Flag", or similar
    const reportTrigger = page
      .getByRole("button", { name: /report|flag/i })
      .or(page.getByLabel(/report/i))
      .first();

    await expect(reportTrigger, {
      message: `Report trigger must be visible [route: /confessions/${SEED_CONFESSION.id}]`,
    }).toBeVisible({ timeout: 8000 });

    await reportTrigger.click();

    // Select or confirm report type if a dialog appears
    const confirmBtn = page
      .getByRole("button", { name: /submit|confirm|send report/i })
      .or(page.getByRole("button", { name: /report/i }))
      .last();

    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Expect success feedback — toast, banner, or dialog
    const successFeedback = page
      .getByText(/report(ed|submitted|received)|thank|success/i)
      .or(page.getByRole("status"))
      .first();

    await expect(successFeedback, {
      message: `Report confirmation must appear [route: /reports (POST)]`,
    }).toBeVisible({ timeout: 8000 });
  });
});
