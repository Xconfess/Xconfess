import { expect, Page, test } from "@playwright/test";

/**
 * Register-to-dashboard Playwright smoke test — #1732
 *
 * Verifies the full registration flow works through the browser route:
 * 1. Fill register form with disposable credentials
 * 2. Submit the form
 * 3. Observe dashboard navigation or expected authenticated state
 *
 * Run: npx playwright test --grep "register-to-dashboard"
 */

const unauthenticatedSession = {
  type: "TERMINAL",
  code: "INVALID_SESSION",
  message: "Your session has expired. Please log in again.",
  retryable: false,
};

const emptyFeed = {
  confessions: [],
  meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasMore: false },
};

const dashboardAnalytics = {
  overview: {
    totalUsers: 12,
    activeUsers: 11,
    totalConfessions: 41,
    totalReports: 0,
    bannedUsers: 0,
    hiddenConfessions: 0,
    deletedConfessions: 0,
  },
  reports: { byStatus: [], byType: [] },
  trends: { confessionsOverTime: [] },
  period: {
    start: "2026-01-01T00:00:00.000Z",
    end: "2026-01-31T23:59:59.999Z",
  },
};

const registeredUser = {
  id: "new-user-1",
  username: "testuser_42",
  email: "testuser_42@example.com",
  role: "user",
  is_active: true,
};

/** Mock register + session routes for a full register → auto-login flow. */
async function mockRegisterFlow(page: Page) {
  let authenticated = false;

  // Registration proxy route
  await page.route("**/api/users/register", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      // Validate payload shape (username, email, password)
      if (
        !body?.username ||
        !body?.email ||
        typeof body?.password !== "string"
      ) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "Missing registration fields" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: registeredUser }),
      });
      return;
    }
    await route.fallback();
  });

  // Session route: GET checks, POST establishes session (auto-login)
  await page.route("**/api/auth/session", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      if (!authenticated) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify(unauthenticatedSession),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: registeredUser }),
      });
      return;
    }

    if (method === "POST") {
      authenticated = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: registeredUser }),
      });
      return;
    }

    if (method === "DELETE") {
      authenticated = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.fallback();
  });
}

/** Provide stable mocks for dashboard data endpoints. */
async function mockDashboardData(page: Page) {
  await page.route("**/api/confessions?**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyFeed),
    });
  });

  await page.route("**/api/admin/analytics*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboardAnalytics),
    });
  });
}

test.describe("Register-to-dashboard smoke", () => {
  test.beforeEach(async ({ page }) => {
    await mockRegisterFlow(page);
    await mockDashboardData(page);
  });

  test("register with disposable credentials and navigate to dashboard", async ({
    page,
  }) => {
    // Navigate to register page
    await page.goto("/register", { waitUntil: "networkidle" });

    // Verify we're on the register page
    await expect(
      page.getByRole("heading", { name: /create account/i }),
    ).toBeVisible();

    // Fill the registration form with disposable credentials
    await page.getByLabel("Username").fill("testuser_42");
    await page.getByLabel("Email").fill("testuser_42@example.com");
    await page.getByLabel("Password", { exact: true }).fill("Str0ng!Pass#1");
    await page.getByLabel("Confirm password").fill("Str0ng!Pass#1");

    // Submit the form
    await page
      .getByRole("button", { name: /create account/i })
      .click();

    // Wait for navigation after successful registration + auto-login
    await page.waitForURL("**/dashboard", { timeout: 15000 });

    // Verify we landed on the dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("register with invalid input stays on register page with field errors", async ({
    page,
  }) => {
    await page.goto("/register", { waitUntil: "networkidle" });

    // Submit with an invalid password (too weak)
    await page.getByLabel("Username").fill("low");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("different");
    await page
      .getByRole("button", { name: /create account/i })
      .click();

    // Validation is client-side — we stay on /register
    await expect(page).toHaveURL(/\/register$/);
    await expect(
      page.getByRole("alert"),
    ).toHaveCountGreaterThanOrEqual(1);
  });

  test("cross-navigation to login remains available on register page", async ({
    page,
  }) => {
    await page.goto("/register", { waitUntil: "networkidle" });

    // Text link in the panel description
    const signInLink = page.getByRole("link", { name: /sign in/i });
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute("href", "/login");

    // Outline button at the bottom of the form
    const signInBtn = page.getByRole("button", { name: /sign in/i });
    await expect(signInBtn).toBeVisible();
  });
});