/**
 * register-to-dashboard-smoke.spec.ts
 *
 * Smoke test: register with disposable credentials, then observe
 * dashboard navigation or expected authenticated state. Uses mock
 * API routes so the test runs without polluting production.
 *
 * Acceptance criteria (issue #1732):
 *   - Test fills register form, submits, and observes dashboard
 *     navigation or expected authenticated state.
 *   - Test can run without polluting production.
 */

import { expect, Page, test } from "@playwright/test";

// ── Test data ────────────────────────────────────────────────────────────────

const NEW_USER = {
  username: "testuser_smoke",
  email: "testuser_smoke@example.com",
  password: "Str0ng!Pass",
};

const REGISTER_RESPONSE = {
  user: {
    id: 999,
    username: NEW_USER.username,
    email: NEW_USER.email,
    role: "user",
    is_active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  token: "mock-jwt-smoke-register",
  anonymousUserId: "anon-smoke-register",
};

const AUTH_SESSION_OK = {
  authenticated: true,
  user: REGISTER_RESPONSE.user,
  requestId: "req-session-register-ok",
};

const EMPTY_FEED = {
  confessions: [],
  meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasMore: false },
};

// ── Mock helpers ─────────────────────────────────────────────────────────────

async function mockRegisterEndpoint(page: Page) {
  await page.route("**/api/users/register", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    // Verify the request body shape
    const body = route.request().postDataJSON();
    if (!body?.username || !body?.email || !body?.password) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Missing required fields",
          code: "VALIDATION_ERROR",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(REGISTER_RESPONSE),
    });
  });
}

async function mockAuthenticatedSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AUTH_SESSION_OK),
    });
  });
}

async function mockDashboardApis(page: Page) {
  // Confession feed
  await page.route("**/api/confessions?**", async (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(EMPTY_FEED),
    });
  });

  // User stats (used by DashboardPage)
  await page.route("**/api/users/*/stats", async (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        confessionCount: 0,
        commentCount: 0,
        reactionCount: 0,
        memberSince: "2026-01-01",
      }),
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Register to dashboard flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockRegisterEndpoint(page);
    await mockAuthenticatedSession(page);
    await mockDashboardApis(page);
  });

  test("fills register form, submits, and lands on dashboard", async ({
    page,
  }) => {
    // Navigate to register page
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    // Verify the form is visible
    await expect(
      page.getByRole("heading", { name: /create account/i }),
    ).toBeVisible();

    // Fill the form
    await page.getByLabel("Username").fill(NEW_USER.username);
    await page.getByLabel("Email").fill(NEW_USER.email);
    await page.getByLabel("Password").fill(NEW_USER.password);
    await page.getByLabel("Confirm password").fill(NEW_USER.password);

    // Submit
    await page.getByRole("button", { name: /create account/i }).click();

    // Wait for navigation to dashboard (the app may redirect to "/"
    // or "/dashboard" after successful registration)
    await page.waitForURL(/\/$|\/dashboard/, { timeout: 10000 });

    // Verify dashboard elements are visible
    // The dashboard page shows a confession feed and user-welcome content
    await expect(
      page.getByRole("heading", { name: /say it\. anonymously\./i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("shows validation errors when form fields are empty", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    // Click submit without filling anything
    await page.getByRole("button", { name: /create account/i }).click();

    // Should show validation errors (the page uses getAuthFieldError
    // and displays inline errors per field)
    await page.waitForTimeout(500);
    const errorMessages = page.locator('[role="alert"], [aria-invalid="true"]');
    // At least one validation message should appear
    await expect(errorMessages.first()).toBeVisible();
  });

  test("handles registration failure gracefully", async ({ page }) => {
    // Override the register mock to return an error
    await page.route("**/api/users/register", async (route) => {
      if (route.request().method() !== "POST") {
        return route.fallback();
      }
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message: "A user with this email already exists",
          code: "EMAIL_TAKEN",
        }),
      });
    });

    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Username").fill(NEW_USER.username);
    await page.getByLabel("Email").fill(NEW_USER.email);
    await page.getByLabel("Password").fill(NEW_USER.password);
    await page.getByLabel("Confirm password").fill(NEW_USER.password);

    await page.getByRole("button", { name: /create account/i }).click();

    // Should show the error message
    await expect(
      page.getByText(/email already exists/i),
    ).toBeVisible({ timeout: 5000 });
  });
});