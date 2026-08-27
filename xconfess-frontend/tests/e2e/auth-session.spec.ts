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
  reports: {
    byStatus: [],
    byType: [],
  },
  trends: {
    confessionsOverTime: [],
  },
  period: {
    start: "2024-01-01T00:00:00.000Z",
    end: "2024-01-31T23:59:59.999Z",
  },
};

async function mockAuthSession(
  page: Page,
  options?: {
    authenticated?: boolean;
    onGetSession?: () => void;
    onPostSession?: () => void;
    onDeleteSession?: () => void;
  },
) {
  let authenticated = options?.authenticated ?? false;

  await page.route("**/api/auth/session", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      options?.onGetSession?.();
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
      options?.onPostSession?.();
      authenticated = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: adminUser, anonymousUserId: "anon-1" }),
      });
      return;
    }

    if (method === "DELETE") {
      options?.onDeleteSession?.();
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
}

test("login redirects authenticated admins into the dashboard", async ({
  page,
}) => {
  await mockAuthSession(page);

  await page.goto("/login");
  await page.getByLabel("Email").fill(adminUser.email);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/admin/dashboard");
  await expect(
    page.getByRole("heading", { name: "Platform Analytics" }),
  ).toBeVisible();
});

test("logout clears the session and redirects back to login", async ({
  page,
}) => {
  await mockAuthSession(page, { authenticated: true });

  await page.goto("/admin/dashboard");
  await expect(
    page.getByRole("heading", { name: "Platform Analytics" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Logout" }).click();

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
});

test("session restore keeps admins signed in after a refresh", async ({
  page,
}) => {
  let getSessionCount = 0;

  await mockAuthSession(page, {
    authenticated: true,
    onGetSession: () => {
      getSessionCount += 1;
    },
  });

  await page.goto("/admin/dashboard");
  await expect(
    page.getByRole("heading", { name: "Platform Analytics" }),
  ).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL("/admin/dashboard");
  await expect(
    page.getByRole("heading", { name: "Platform Analytics" }),
  ).toBeVisible();
  expect(getSessionCount).toBeGreaterThanOrEqual(2);
});

test("protected routes redirect unauthenticated visitors to login", async ({
  page,
}) => {
  await mockAuthSession(page, { authenticated: false });

  await page.goto("/profile");

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
});
