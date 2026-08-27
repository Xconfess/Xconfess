import { expect, Page, test } from "@playwright/test";

const anonymousUser = {
  id: "anon-e2e-test-user",
  createdAt: "2026-06-01T00:00:00.000Z",
};

const seededConfession = {
  id: "e2e-confession-1",
  message: "E2E test confession: I love writing automated tests.",
  gender: "other",
  tags: ["technology"],
  view_count: 0,
  created_at: "2026-06-25T10:00:00.000Z",
  reactions: { like: 0, love: 0 },
  commentCount: 0,
  author: { id: anonymousUser.id, username: "Anonymous" },
};

const seededReaction = {
  id: "e2e-reaction-1",
  emoji: "❤️",
  confession: { id: seededConfession.id },
  anonymousUser: { id: anonymousUser.id },
  createdAt: "2026-06-25T10:01:00.000Z",
};

const seededComment = {
  id: 1,
  content: "Great confession! Totally agree.",
  createdAt: "2026-06-25T10:02:00.000Z",
  anonymousUser: { id: anonymousUser.id },
  confession: { id: seededConfession.id },
};

async function mockEngagementJourney(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("xconfess_anonymous_user_id", anonymousUser.id);
  });

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: anonymousUser.id,
          username: "Anonymous",
          role: "user",
          is_active: true,
        },
      }),
    });
  });

  // Mock confession creation
  await page.route("**/api/confessions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(seededConfession),
    });
  });

  // Mock reaction creation
  await page.route("**/api/reactions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(seededReaction),
    });
  });

  // Mock comment creation
  await page.route("**/api/comments/*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(seededComment),
    });
  });

  // Mock confessions feed (updated with reaction and comment)
  await page.route("**/api/confessions?**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const confessionWithEngagement = {
      ...seededConfession,
      reactions: { like: 0, love: 1 },
      commentCount: 1,
      view_count: 5,
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        confessions: [confessionWithEngagement],
        total: 1,
        page: 1,
        hasMore: false,
      }),
    });
  });

  // Mock single confession detail
  await page.route(
    `**/api/confessions/${seededConfession.id}`,
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...seededConfession,
          reactions: { like: 0, love: 1 },
          commentCount: 1,
          view_count: 5,
        }),
      });
    },
  );

  // Mock comments list for the confession
  await page.route(
    `**/api/comments/by-confession/${seededConfession.id}**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [seededComment],
          total: 1,
        }),
      });
    },
  );

  // Mock user stats (so the dashboard doesn't 404)
  await page.route("**/api/users/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalConfessions: 3,
        totalReactions: 5,
        mostPopularConfession: seededConfession.id,
        badges: ["ConfessionStarter"],
        streak: 1,
      }),
    });
  });
}

test.describe("Confession-to-engagement E2E journey", () => {
  test.beforeEach(async ({ page }) => {
    await mockEngagementJourney(page);
  });

  test("register anonymous session → post confession → add reaction → add comment → verify all appear in feed", async ({
    page,
  }) => {
    // 1. Land on home page as anonymous user
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /quieter, more luxurious home for anonymous truth/i,
      }),
    ).toBeVisible();

    // 2. Post a new confession
    await page.getByRole("button", { name: "Begin writing" }).click();
    await page.getByPlaceholder(/share something/i).fill(seededConfession.message);
    await page.getByRole("button", { name: /confess/i }).click();

    // Wait for navigation back to feed
    await page.waitForURL("/");
    await expect(
      page.getByText(seededConfession.message),
    ).toBeVisible({ timeout: 10000 });

    // 3. Navigate to confession detail
    await page.getByText(seededConfession.message).click();
    await expect(page).toHaveURL(new RegExp(`/confessions/${seededConfession.id}`));

    // 4. Add a reaction (❤️)
    const reactButton = page.getByLabel("❤️").or(page.getByText("❤️"));
    await reactButton.click();

    // Verify reaction count updated
    await expect(page.getByText(/1/)).toBeVisible();

    // 5. Add a comment
    const commentInput = page.getByPlaceholder(/write a comment/i);
    await commentInput.fill(seededComment.content);
    await page.getByRole("button", { name: /comment/i }).click();

    // Verify comment appears
    await expect(page.getByText(seededComment.content)).toBeVisible();

    // 6. Navigate back to feed
    await page.goto("/");

    // 7. Verify the confession still appears with engagement counts
    await expect(
      page.getByText(seededConfession.message),
    ).toBeVisible();
    await expect(page.getByText("❤️")).toBeVisible();
  });
});
