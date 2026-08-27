import { expect, Page, test } from "@playwright/test";

const adminUser = {
  id: "1",
  email: "admin@example.com",
  username: "admin",
  role: "admin",
  is_active: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const analyticsResponse = {
  overview: {
    totalUsers: 12,
    activeUsers: 9,
    totalConfessions: 41,
    totalReports: 2,
    bannedUsers: 0,
    hiddenConfessions: 0,
    deletedConfessions: 0,
  },
  reports: { byStatus: [], byType: [] },
  trends: { confessionsOverTime: [] },
  period: {
    start: "2024-01-01T00:00:00.000Z",
    end: "2024-01-31T23:59:59.999Z",
  },
};

async function mockAuthenticatedProfileFlow(page: Page) {
  let authenticated = false;

  await page.route("**/api/auth/session", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      if (!authenticated) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ message: "Not authenticated" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: true, user: adminUser }),
      });
      return;
    }

    if (method === "POST") {
      authenticated = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: adminUser, anonymousUserId: "anon-1" }),
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

  await page.route("**/api/admin/analytics*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(analyticsResponse),
    });
  });

  await page.route("**/user/deactivate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
}

test("user can deactivate account and logout", async ({ page }) => {
  await mockAuthenticatedProfileFlow(page);

  await page.goto("/login");
  await page.getByLabel("Email").fill(adminUser.email);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/admin/dashboard");

  await page.goto("/profile");
  await expect(page.getByText("@admin")).toBeVisible();

  await page.getByRole("button", { name: "Deactivate account" }).click();

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
});
