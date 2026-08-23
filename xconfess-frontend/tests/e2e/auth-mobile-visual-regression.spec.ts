import { test, expect, Page } from "@playwright/test";

/**
 * Auth page mobile visual regression — #1733
 *
 * Screenshots and overlap checks for /login and /register at mobile width.
 * Run: npx playwright test --grep "auth-mobile"
 */

const MOBILE_VIEWPORT = { width: 375, height: 667 };

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

async function mockUnauthenticated(page: Page) {
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

async function mockAllRoutes(page: Page) {
  await mockUnauthenticated(page);
  await mockConfessionList(page);
}

test.describe("Auth page mobile visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllRoutes(page);
    await page.setViewportSize(MOBILE_VIEWPORT);
  });

  test("login page renders correctly at mobile width", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    // Verify key elements are visible
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    // Verify cross-navigation button is visible
    const createAccountBtn = page.getByRole("button", {
      name: /create account/i,
    });
    await expect(createAccountBtn).toBeVisible();

    // Verify primary action button is visible
    const signInBtn = page.getByRole("button", { name: /sign in/i });
    await expect(signInBtn).toBeVisible();

    // Screenshot for visual regression baseline
    await expect(page).toHaveScreenshot("login-mobile.png", {
      fullPage: true,
    });
  });

  test("register page renders correctly at mobile width", async ({ page }) => {
    await page.goto("/register", { waitUntil: "networkidle" });

    // Verify key elements are visible
    await expect(
      page.getByRole("heading", { name: /create account/i }),
    ).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();

    // Verify cross-navigation link/button is visible
    // The register page has a text link "Sign in" in the description
    await expect(
      page.getByRole("link", { name: /sign in/i }),
    ).toBeVisible();

    // Verify the "Sign in" outline button (cross-navigation) is visible
    const signInBtn = page.getByRole("button", { name: /sign in/i });
    await expect(signInBtn).toBeVisible();

    // Verify primary submit button is visible
    const createAccountBtn = page.getByRole("button", {
      name: /create account/i,
    });
    await expect(createAccountBtn).toBeVisible();

    // Screenshot for visual regression baseline
    await expect(page).toHaveScreenshot("register-mobile.png", {
      fullPage: true,
    });
  });

  test("cross-navigation buttons do not overlap on login page", async ({
    page,
  }) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    const signInBtn = page.getByRole("button", { name: /sign in/i });
    const createAccountBtn = page.getByRole("button", {
      name: /create account/i,
    });

    await expect(signInBtn).toBeVisible();
    await expect(createAccountBtn).toBeVisible();

    const signInBox = await signInBtn.boundingBox();
    const createAccountBox = await createAccountBtn.boundingBox();

    // Both buttons must exist
    expect(signInBox).not.toBeNull();
    expect(createAccountBox).not.toBeNull();

    // They should not overlap vertically (one is below the other)
    if (signInBox && createAccountBox) {
      // Sign in button should be above Create account button
      // (or vice versa, depending on DOM order)
      const gap = createAccountBox.y - (signInBox.y + signInBox.height);
      expect(gap).toBeGreaterThanOrEqual(0);
    }
  });

  test("cross-navigation buttons do not overlap on register page", async ({
    page,
  }) => {
    await page.goto("/register", { waitUntil: "networkidle" });

    const createAccountBtn = page.getByRole("button", {
      name: /create account/i,
    });
    const signInBtn = page.getByRole("button", { name: /sign in/i });

    await expect(createAccountBtn).toBeVisible();
    await expect(signInBtn).toBeVisible();

    const createBox = await createAccountBtn.boundingBox();
    const signInBox = await signInBtn.boundingBox();

    expect(createBox).not.toBeNull();
    expect(signInBox).not.toBeNull();

    if (createBox && signInBox) {
      // Create account (submit) should be above Sign in (outline) button
      const gap = signInBox.y - (createBox.y + createBox.height);
      expect(gap).toBeGreaterThanOrEqual(0);
    }
  });
});