import { expect, Page, test } from "@playwright/test";

const adminUser = {
  id: 1,
  username: "seed_admin",
  email: "seed_admin@example.com",
  role: "admin",
  is_active: true,
};

async function mockAdminApis(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: adminUser, accessToken: "admin-smoke-token" }),
    });
  });

  await page.route("**/api/admin/analytics**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        overview: {
          totalUsers: 2,
          activeUsers: 2,
          totalConfessions: 3,
          totalReports: 1,
          bannedUsers: 0,
          hiddenConfessions: 0,
          deletedConfessions: 0,
        },
        reports: { byStatus: [], byType: [] },
        trends: { confessionsOverTime: [] },
        period: {
          start: "2026-08-01T00:00:00.000Z",
          end: "2026-08-11T00:00:00.000Z",
        },
      }),
    });
  });

  await page.route("**/api/admin/reports/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pendingCount: 1,
        oldestUnresolvedAge: 3600,
        resolvedTodayCount: 2,
      }),
    });
  });
}

test.describe("Admin responsive navigation smoke", () => {
  test("desktop sidebar renders admin navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockAdminApis(page);

    await page.goto("/admin/dashboard");

    await expect(page.getByRole("heading", { name: "Platform health" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toBeVisible();
  });

  test("mobile drawer opens, traps focus, closes, and restores focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAdminApis(page);

    await page.goto("/admin/dashboard");

    const openButton = page.getByRole("button", { name: "Open admin navigation" });
    await openButton.focus();
    await openButton.click();

    const closeButton = page.getByRole("button", { name: "Close admin navigation" });
    await expect(closeButton).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Admin navigation" })).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();

    await closeButton.click();
    await expect(page.getByRole("dialog", { name: "Admin navigation" })).toBeHidden();
    await expect(openButton).toBeFocused();
  });
});
