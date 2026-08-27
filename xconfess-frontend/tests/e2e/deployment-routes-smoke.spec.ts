import { expect, Page, test } from "@playwright/test";

const unauthenticatedSession = {
  type: "TERMINAL",
  code: "INVALID_SESSION",
  message: "Your session has expired. Please log in again.",
  retryable: false,
};

async function mockVisitorApis(page: Page) {
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

  await page.route("**/api/confessions?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        confessions: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasMore: false },
      }),
    });
  });
}

test.describe("Deployment route smoke", () => {
  test("public/auth/protected routes load without broken Next assets", async ({ page }) => {
    const brokenStaticAssets: string[] = [];

    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("/_next/static/") && response.status() >= 400) {
        brokenStaticAssets.push(`${response.status()} ${url}`);
      }
    });

    await mockVisitorApis(page);

    for (const path of ["/", "/login", "/register", "/dashboard", "/admin/dashboard"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should not server-error`).toBeLessThan(500);
      await page.waitForLoadState("domcontentloaded");
    }

    await expect(page.locator("body")).toBeVisible();
    expect(brokenStaticAssets).toEqual([]);
  });
});
