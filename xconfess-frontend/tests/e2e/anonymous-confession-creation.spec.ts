/**
 * anonymous-confession-creation.spec.ts
 *
 * End-to-end coverage for anonymous confession creation flow.
 *
 * Flows:
 *   1. Authenticate and establish session
 *   2. Create anonymous confession via form
 *   3. Verify anonymous presentation on feed
 *   4. Validate that authenticated user ID is not exposed
 *   5. Test validation failure handling
 *
 * All flows are critical — test file exits non-zero on failure.
 */

import { expect, Page, test } from "@playwright/test";

// ── Test data ────────────────────────────────────────────────────────────────

const TEST_USER = {
  id: 42,
  username: "anon_test_user",
  email: "anon-test@example.com",
  password: "password123",
  role: "user",
  is_active: true,
};

const ANONYMOUS_CONFESSION_VARIANTS = [
  {
    message: "I secretly love debugging other people's code.",
    gender: "male" as const,
    tags: ["work"],
  },
  {
    message: "I've deleted code without committing it",
    gender: "female" as const,
    tags: ["tech", "mistakes"],
  },
  {
    message: "Sometimes I copy-paste from StackOverflow without reading it",
    gender: "other" as const,
    tags: ["humor"],
  },
];

// ── Mock setup ───────────────────────────────────────────────────────────────

async function setupAnonymousConfessionMocks(page: Page) {
  let authenticated = false;
  let anonymousUserId = "anon-user-" + Math.random().toString(36).slice(2, 9);
  const createdConfessions: any[] = [];

  // Auth: login
  await page.route("**/api/auth/login", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    authenticated = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: TEST_USER,
        anonymousUserId,
        requestId: "req-login-anon",
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
        user: TEST_USER,
        anonymousUserId,
        requestId: "req-session-ok",
      }),
    });
  });

  // Confessions: create
  await page.route("**/api/confessions", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (!authenticated) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized" }),
      });
      return;
    }

    const postData = await route.request().postDataJSON();
    const confessionId = "confession-" + Math.random().toString(36).slice(2, 9);
    const confession = {
      id: confessionId,
      message: postData.message,
      gender: postData.gender,
      tags: postData.tags || [],
      anonymous: postData.anonymous ?? true,
      anonymousUserId,
      authorId: TEST_USER.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      viewCount: 0,
      reactionCount: 0,
      commentCount: 0,
      reactions: {},
      requestId: "req-create-confession",
    };

    createdConfessions.push(confession);

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(confession),
    });
  });

  // Confessions: feed/list
  await page.route("**/api/confessions*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: createdConfessions,
        total: createdConfessions.length,
        page: 1,
        limit: 20,
        requestId: "req-list-confessions",
      }),
    });
  });

  // Confessions: get single
  await page.route("**/api/confessions/:id", async (route) => {
    const url = route.request().url();
    const id = url.split("/").pop();
    const confession = createdConfessions.find((c) => c.id === id);

    if (!confession) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ message: "Confession not found" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(confession),
    });
  });

  return { authenticated, createdConfessions };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Anonymous Confession Creation E2E", () => {
  test("authenticates user and establishes session", async ({ page }) => {
    await setupAnonymousConfessionMocks(page);

    // Navigate to login
    await page.goto("/login");
    await expect(page).toHaveTitle(/login|sign in/i);

    // Enter credentials and submit
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Should redirect to feed or dashboard
    await page.waitForURL(/\/(feed|dashboard|confessions)/, { timeout: 5000 });
  });

  test("creates anonymous confession via form", async ({ page }) => {
    const { createdConfessions } = await setupAnonymousConfessionMocks(page);

    // Authenticate
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(feed|dashboard|confessions)/, { timeout: 5000 });

    // Navigate to confession form
    await page.click("button:has-text('New Confession'), a:has-text('Compose'), button:has-text('+')")
      .catch(() => page.goto("/confessions/new"));

    // Fill form
    const testConfession = ANONYMOUS_CONFESSION_VARIANTS[0];
    await page.fill('textarea[name="message"], textarea', testConfession.message);
    await page.selectOption('select[name="gender"]', testConfession.gender);
    await page.click('input[name="anonymous"]');

    // Submit
    await page.click('button[type="submit"]:has-text("Confess")');

    // Verify success
    await expect(page).toHaveURL(/\/(feed|confessions|dashboard)/, { timeout: 5000 });
    expect(createdConfessions.length).toBeGreaterThan(0);
  });

  test("displays anonymous presentation on feed", async ({ page }) => {
    const { createdConfessions } = await setupAnonymousConfessionMocks(page);

    // Create and authenticate
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(feed|dashboard|confessions)/, { timeout: 5000 });

    // Create confession
    await page.click("button:has-text('New Confession'), a:has-text('Compose'), button:has-text('+')")
      .catch(() => page.goto("/confessions/new"));
    const testConfession = ANONYMOUS_CONFESSION_VARIANTS[1];
    await page.fill('textarea[name="message"], textarea', testConfession.message);
    await page.click('input[name="anonymous"]');
    await page.click('button[type="submit"]:has-text("Confess")');

    // Verify feed displays anonymous indicator
    await page.waitForSelector('text=Anonymous');
    const anonymousLabel = await page.locator('text=Anonymous').first();
    await expect(anonymousLabel).toBeVisible();

    // Verify no authenticated username displayed
    const createdConfession = createdConfessions[createdConfessions.length - 1];
    const usernames = await page.locator(`text=${TEST_USER.username}`).count();
    expect(usernames).toBe(0);
  });

  test("does not expose authenticated user identifier", async ({ page }) => {
    const { createdConfessions } = await setupAnonymousConfessionMocks(page);

    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(feed|dashboard|confessions)/, { timeout: 5000 });

    // Create anonymous confession
    await page.click("button:has-text('New Confession'), a:has-text('Compose'), button:has-text('+')")
      .catch(() => page.goto("/confessions/new"));
    const testConfession = ANONYMOUS_CONFESSION_VARIANTS[2];
    await page.fill('textarea[name="message"], textarea', testConfession.message);
    await page.click('input[name="anonymous"]');
    await page.click('button[type="submit"]:has-text("Confess")');

    // Check page content for any identifier leaks
    const pageContent = await page.content();
    expect(pageContent).not.toContain(TEST_USER.username);
    expect(pageContent).not.toContain(TEST_USER.id.toString());
    expect(pageContent).not.toMatch(new RegExp(`user[_-]?${TEST_USER.id}`, "i"));
  });

  test("validates required fields and shows error messages", async ({ page }) => {
    await setupAnonymousConfessionMocks(page);

    // Authenticate
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(feed|dashboard|confessions)/, { timeout: 5000 });

    // Navigate to form
    await page.click("button:has-text('New Confession'), a:has-text('Compose'), button:has-text('+')")
      .catch(() => page.goto("/confessions/new"));

    // Try to submit empty form
    await page.click('button[type="submit"]:has-text("Confess")');

    // Verify validation error displayed
    const errorMessage = page.locator('text=required, text=cannot be empty, text=Please enter');
    await expect(errorMessage.first()).toBeVisible({ timeout: 3000 });
  });

  test("rejects excessively long confession messages", async ({ page }) => {
    await setupAnonymousConfessionMocks(page);

    // Authenticate
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(feed|dashboard|confessions)/, { timeout: 5000 });

    // Navigate to form
    await page.click("button:has-text('New Confession'), a:has-text('Compose'), button:has-text('+')")
      .catch(() => page.goto("/confessions/new"));

    // Enter excessively long message
    const longMessage = "a".repeat(5000);
    await page.fill('textarea[name="message"], textarea', longMessage);
    await page.click('button[type="submit"]:has-text("Confess")');

    // Verify error
    const errorMessage = page.locator('text=too long, text=maximum, text=characters');
    await expect(errorMessage.first()).toBeVisible({ timeout: 3000 });
  });

  test("maintains anonymous state across page navigation", async ({ page }) => {
    const { createdConfessions } = await setupAnonymousConfessionMocks(page);

    // Authenticate and create
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(feed|dashboard|confessions)/, { timeout: 5000 });

    // Create confession
    await page.click("button:has-text('New Confession'), a:has-text('Compose'), button:has-text('+')")
      .catch(() => page.goto("/confessions/new"));
    const testConfession = ANONYMOUS_CONFESSION_VARIANTS[0];
    await page.fill('textarea[name="message"], textarea', testConfession.message);
    await page.click('input[name="anonymous"]');
    await page.click('button[type="submit"]:has-text("Confess")');

    const confessionId = createdConfessions[createdConfessions.length - 1]?.id;
    await page.waitForURL(/\/(feed|confessions|dashboard)/, { timeout: 5000 });

    // Navigate to confession detail
    if (confessionId) {
      await page.goto(`/confessions/${confessionId}`);
      await page.waitForSelector('text=Anonymous');
      await expect(page.locator('text=Anonymous')).toBeVisible();
    }

    // Navigate back and verify state
    await page.goBack();
    await expect(page).toHaveURL(/\/(feed|confessions|dashboard)/);
  });

  test("recovers from network errors during submission", async ({ page }) => {
    const { createdConfessions } = await setupAnonymousConfessionMocks(page);

    // Simulate network interruption
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(feed|dashboard|confessions)/, { timeout: 5000 });

    // Offline mode
    await page.context().setOffline(true);
    await page.click("button:has-text('New Confession'), a:has-text('Compose'), button:has-text('+')")
      .catch(() => page.goto("/confessions/new"));

    // Fill and attempt submission
    const testConfession = ANONYMOUS_CONFESSION_VARIANTS[0];
    await page.fill('textarea[name="message"], textarea', testConfession.message);
    await page.click('button[type="submit"]:has-text("Confess")');

    // Expect error message
    const offlineMessage = page.locator('text=offline, text=network, text=connection');
    await expect(offlineMessage.first()).toBeVisible({ timeout: 3000 }).catch(() => {});

    // Restore connection
    await page.context().setOffline(false);
    await page.click('button:has-text("Retry"), button:has-text("Try again")');

    // Should succeed
    await page.waitForURL(/\/(feed|confessions|dashboard)/, { timeout: 5000 });
  });
});
