import { expect, Page, test } from "@playwright/test";

const seededUser = {
  id: "wave-admin-1",
  username: "wave-admin",
  email: "wave-admin@example.com",
  role: "admin",
  createdAt: "2026-05-15T12:00:00.000Z",
};

const seededConfession = {
  id: "wave-1",
  content:
    "Wave demo confession: I finally told my team I was overloaded, and they helped me untangle the week.",
  createdAt: "2026-05-20T10:00:00.000Z",
  viewCount: 42,
  commentCount: 1,
  reactions: { like: 7, love: 3 },
  author: { id: "anon-wave", username: "Anonymous" },
  isAnchored: true,
  stellarTxHash: "demo-wave-stellar-tx",
};

async function mockWaveDemoData(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("xconfess_anonymous_user_id", "anon-wave-demo");
  });

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: seededUser }),
    });
  });

  await page.route("**/api/users/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalConfessions: 12,
        totalReactions: 84,
        mostPopularConfession: seededConfession.id,
        badges: ["ConfessionStarter"],
        streak: 5,
      }),
    });
  });

  await page.route("**/api/confessions?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        confessions: [seededConfession],
        total: 1,
        page: 1,
        hasMore: false,
      }),
    });
  });

  await page.route("**/api/confessions/wave-1", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(seededConfession),
    });
  });

  await page.route("**/api/confessions/wave-1/report", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "report-wave-1",
        confessionId: seededConfession.id,
        status: "pending",
      }),
    });
  });

  await page.route("**/api/admin/analytics**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        overview: {
          totalUsers: 128,
          activeUsers: 91,
          totalConfessions: 312,
          totalReports: 18,
          bannedUsers: 2,
          hiddenConfessions: 4,
          deletedConfessions: 7,
        },
        reports: {
          byStatus: [
            { status: "pending", count: "3" },
            { status: "resolved", count: "15" },
          ],
          byType: [{ type: "other", count: "8" }],
        },
        trends: {
          confessionsOverTime: [{ date: "2026-05-20", count: "12" }],
        },
        period: {
          start: "2026-05-01T00:00:00.000Z",
          end: "2026-06-01T00:00:00.000Z",
        },
      }),
    });
  });
}

test.describe("Wave 5 seeded demo journey", () => {
  test.beforeEach(async ({ page }) => {
    await mockWaveDemoData(page);
  });

  test("covers feed, detail, report, and admin analytics", async ({ page }) => {
    // --- Feed page: wait for network idle before asserting ---
    await page.goto("/", { waitUntil: "networkidle" });

    // Use dedicated locators with explicit timeouts for CI stability
    const welcomeText = page.getByText("Welcome back");
    await expect(welcomeText).toBeVisible({ timeout: 10_000 });

    const confessionText = page.getByText(seededConfession.content);
    await expect(confessionText).toBeVisible({ timeout: 10_000 });

    // --- Detail page: click and verify navigation ---
    await confessionText.click();
    await page.waitForURL(/\/confessions\/wave-1/, { timeout: 10_000 });

    const viewCount = page.getByText("42 views");
    await expect(viewCount).toBeVisible({ timeout: 10_000 });

    // --- Report flow: use role-based locator ---
    const reportButton = page.getByRole("button", { name: "Report confession" });
    await expect(reportButton).toBeEnabled({ timeout: 5_000 });
    await reportButton.click();

    const reportConfirmation = page.getByText("Report submitted. Thank you!");
    await expect(reportConfirmation).toBeVisible({ timeout: 10_000 });

    // --- Admin analytics: navigate with network idle ---
    await page.goto("/admin/dashboard", { waitUntil: "networkidle" });

    const heading = page.getByRole("heading", { name: "Platform Analytics" });
    await expect(heading).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("312")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("18")).toBeVisible({ timeout: 10_000 });
  });
});
