import { expect, Page, test } from "@playwright/test";

const emptyFeed = {
  confessions: [],
  meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasMore: false },
};

/** Stable 401 body (real session route shape when no cookie). */
const unauthenticatedSession = {
  type: "TERMINAL",
  code: "INVALID_SESSION",
  message: "Your session has expired. Please log in again.",
  retryable: false,
};

async function mockUnauthenticatedSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify(unauthenticatedSession),
      });
      return;
    }
    await route.fallback();
  });
}

async function mockConfessionList(page: Page) {
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
}

test.describe("Public pages smoke", () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticatedSession(page);
    await mockConfessionList(page);
  });

  test("home feed landing loads for visitors", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /say it\. anonymously\./i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Write confession" }),
    ).toBeVisible();
  });

  test("login page shows sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("register page shows create-account form", async ({ page }) => {
    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: "Create account" }),
    ).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("search is not available to unauthenticated visitors", async ({
    page,
  }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Search confessions")).toHaveCount(0);
  });

  test("confession detail route responds for visitors", async ({ page }) => {
    const response = await page.goto("/confessions/1");
    expect(response?.status()).toBeLessThan(500);
    await page.waitForLoadState("domcontentloaded");
    // SSR may include demo copy even when the client AuthGuard hides the dashboard shell.
    await expect(page.locator("body")).toContainText(/confession/i);
  });
});
