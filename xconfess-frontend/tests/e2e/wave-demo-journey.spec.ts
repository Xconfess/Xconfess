import { expect, Page, Route, test } from "@playwright/test";

const seededUser = {
  id: "wave-admin-1",
  username: "wave-admin",
  email: "wave-admin@example.com",
  role: "admin",
  is_active: true,
  createdAt: "2026-05-15T12:00:00.000Z",
  updatedAt: "2026-05-15T12:00:00.000Z",
};

const seededConfession = {
  id: "wave-1",
  content:
    "Wave demo confession: I finally told my team I was overloaded, and they helped me untangle the week.",
  message:
    "Wave demo confession: I finally told my team I was overloaded, and they helped me untangle the week.",
  createdAt: "2026-05-20T10:00:00.000Z",
  created_at: "2026-05-20T10:00:00.000Z",
  viewCount: 42,
  view_count: 42,
  commentCount: 1,
  reactions: { like: 7, love: 3 },
  author: { id: "anon-wave", username: "Anonymous" },
  anonymousUser: { id: "anon-wave" },
  isAnchored: true,
  stellarTxHash: "demo-wave-stellar-tx",
};

const analyticsResponse = {
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
};

const requiresBackendUrl =
  process.env.WAVE_DEMO_REQUIRE_BACKEND === "true" &&
  !process.env.BACKEND_API_URL &&
  !process.env.NEXT_PUBLIC_API_URL;

test.skip(
  requiresBackendUrl,
  "Set BACKEND_API_URL or NEXT_PUBLIC_API_URL when WAVE_DEMO_REQUIRE_BACKEND=true.",
);

function toBase64Url(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createAdminSessionToken() {
  return [
    toBase64Url({ alg: "none", typ: "JWT" }),
    toBase64Url({
      sub: seededUser.id,
      email: seededUser.email,
      username: seededUser.username,
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
    "wave-demo-signature",
  ].join(".");
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function seedAdminSessionCookie(page: Page, baseURL?: string) {
  await page.context().addCookies([
    {
      name: "xconfess_session",
      value: createAdminSessionToken(),
      url: baseURL ?? "http://127.0.0.1:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function mockWaveDemoData(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("xconfess_anonymous_user_id", "anon-wave-demo");
    localStorage.setItem(
      "xconfess-onboarding",
      JSON.stringify({
        state: {
          isCompleted: true,
          completedSteps: [],
          currentStep: 0,
          hasSeenWelcome: true,
        },
        version: 0,
      }),
    );
  });

  await page.route("**/api/auth/session**", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await fulfillJson(route, 200, {
        authenticated: true,
        user: seededUser,
      });
      return;
    }

    if (method === "DELETE") {
      await fulfillJson(route, 200, { success: true });
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/users/stats", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await fulfillJson(route, 200, {
      totalConfessions: 12,
      totalReactions: 84,
      mostPopularConfession: seededConfession.id,
      badges: ["ConfessionStarter"],
      streak: 5,
    });
  });

  await page.route("**/confessions/drafts", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await fulfillJson(route, 200, []);
  });

  await page.route("**/api/confessions/wave-1/tip-stats", async (route) => {
    await fulfillJson(route, 200, {
      totalAmount: 0,
      totalCount: 0,
      averageAmount: 0,
    });
  });

  await page.route("**/api/comments/by-confession/wave-1**", async (route) => {
    await fulfillJson(route, 200, {
      comments: [],
      hasMore: false,
    });
  });

  await page.route("**/api/confessions/wave-1/report", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await fulfillJson(route, 201, {
      id: "report-wave-1",
      confessionId: seededConfession.id,
      status: "pending",
    });
  });

  await page.route("**/api/confessions/wave-1", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await fulfillJson(route, 200, seededConfession);
  });

  await page.route("**/api/confessions?**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await fulfillJson(route, 200, {
      confessions: [seededConfession],
      total: 1,
      page: 1,
      hasMore: false,
      meta: {
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasMore: false,
      },
    });
  });

  await page.route("**/api/admin/analytics**", async (route) => {
    await fulfillJson(route, 200, analyticsResponse);
  });
}

async function gotoAndSettle(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} should not server-error`).toBeLessThan(
    500,
  );
  await page.waitForLoadState("domcontentloaded");
}

async function dismissOnboardingIfVisible(page: Page) {
  const skipButton = page.getByRole("button", { name: "Skip & Explore" });

  try {
    await skipButton.waitFor({ state: "visible", timeout: 1000 });
    await skipButton.click();
    await expect(skipButton).toBeHidden({ timeout: 1000 });
  } catch {
    // The onboarding modal is optional in this journey; continue when absent.
  }
}

test.describe("Wave 5 seeded demo journey", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await seedAdminSessionCookie(page, baseURL);
    await mockWaveDemoData(page);
  });

  test("covers feed, detail, report, and admin analytics", async ({ page }) => {
    await gotoAndSettle(page, "/");
    await dismissOnboardingIfVisible(page);
    await expect(
      page.getByRole("heading", {
        name: /quieter, more luxurious home for anonymous truth/i,
      }),
    ).toBeVisible();
    await expect(page.getByText(seededConfession.content)).toBeVisible();

    await page
      .locator(`a[href="/confessions/${seededConfession.id}"]`)
      .filter({ hasText: seededConfession.content })
      .first()
      .click();

    await expect(page).toHaveURL(new RegExp(`/confessions/${seededConfession.id}$`));
    await dismissOnboardingIfVisible(page);
    await expect(page.getByText(seededConfession.content)).toBeVisible();
    await expect(page.getByText("42 views")).toBeVisible();

    await page.getByRole("button", { name: "Report confession" }).click();
    await expect(page.getByText("Report submitted. Thank you!")).toBeVisible();

    await gotoAndSettle(page, "/admin/dashboard");
    await dismissOnboardingIfVisible(page);
    await expect(
      page.getByRole("heading", { name: "Platform Analytics" }),
    ).toBeVisible();
    await expect(page.getByText("312")).toBeVisible();
    await expect(page.getByText("18")).toBeVisible();
  });
});
