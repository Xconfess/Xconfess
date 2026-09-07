import { expect, Page, test } from "@playwright/test";
import type { Notification, NotificationType, PaginatedNotifications } from "@/app/types/notifications";

const WS_ABORT_PATTERNS = ["**/socket.io/**"];

function buildNotifications(): Notification[] {
  const now = new Date().toISOString();
  return [
    {
      id: "n-1",
      userId: "current-user-id",
      type: NotificationType.REACTION,
      title: "New reaction on your confession",
      message: "@crypto_saint reacted 🔥 to “My first on-chain confession”",
      metadata: { confessionId: "c-1", reactionType: "fire", actorUsername: "crypto_saint" },
      isRead: false,
      createdAt: now,
    },
    {
      id: "n-2",
      userId: "current-user-id",
      type: NotificationType.COMMENT,
      title: "New comment",
      message: "@anon left a comment on your confession",
      metadata: { confessionId: "c-1", commentId: "cm-1", actorUsername: "anon" },
      isRead: false,
      createdAt: now,
    },
    {
      id: "n-3",
      userId: "current-user-id",
      type: NotificationType.TIP,
      title: "You received a tip",
      message: "You received a 5 XLM tip on “Late night thoughts”",
      metadata: { confessionId: "c-2", tipId: "t-1", amount: 5 },
      isRead: true,
      createdAt: now,
    },
  ];
}

function buildReadAll(): Notification[] {
  return buildNotifications().map((n) => ({ ...n, isRead: true }));
}

function paginated(notifications: Notification[]): PaginatedNotifications {
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  return {
    notifications,
    total: notifications.length,
    unreadCount,
    page: 1,
    totalPages: 1,
  };
}

const DEFAULT_PREFERENCES = {
  userId: "current-user-id",
  reaction: true,
  comment: true,
  tip: true,
  badge: true,
  mention: true,
  follow: true,
  emailNotifications: false,
  pushNotifications: true,
};

/**
 * Install stable network mocks so the notification center renders without a
 * live backend. `scenario` controls the seeded notification data.
 */
async function mockNotificationCenter(
  page: Page,
  scenario: "empty" | "unread" | "read-all",
) {
  for (const pattern of WS_ABORT_PATTERNS) {
    await page.route(pattern, (route) => route.abort());
  }

  const payload =
    scenario === "empty"
      ? paginated([])
      : scenario === "read-all"
        ? paginated(buildReadAll())
        : paginated(buildNotifications());

  await page.route("**/notifications**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();

    if (method === "GET" && url.includes("/preferences")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(DEFAULT_PREFERENCES),
      });
    }

    if (method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    }

    // markAsRead / markAllAsRead / deleteNotification
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/dev/notification-center");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
}

test.describe("Notification center visual regression", () => {
  test("empty state (desktop)", async ({ page }) => {
    await mockNotificationCenter(page, "empty");

    await expect(page.getByText("No notifications yet")).toBeVisible();
    await expect(
      page.getByText("Activity on your confessions will show up here"),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("notification-center-empty.png", {
      animations: "disabled",
    });
  });

  test("unread state (desktop)", async ({ page }) => {
    await mockNotificationCenter(page, "unread");

    await expect(page.getByText("2 unread notifications")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark all read" })).toBeVisible();

    await expect(page).toHaveScreenshot("notification-center-unread.png", {
      animations: "disabled",
    });
  });

  test("unread state (mobile viewport)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockNotificationCenter(page, "unread");

    await expect(page.getByText("2 unread notifications")).toBeVisible();

    await expect(page).toHaveScreenshot("notification-center-unread-mobile.png", {
      animations: "disabled",
    });
  });

  test("read-all state hides the unread controls", async ({ page }) => {
    await mockNotificationCenter(page, "read-all");

    await expect(page.getByText("2 unread notifications")).toBeHidden();
    await expect(page.getByRole("button", { name: "Mark all read" })).toBeHidden();
    await expect(page.getByText("You received a tip")).toBeVisible();

    await expect(page).toHaveScreenshot("notification-center-read-all.png", {
      animations: "disabled",
    });
  });

  test("mark all as read transitions to the caught-up state", async ({ page }) => {
    await mockNotificationCenter(page, "unread");

    await page.getByRole("button", { name: "Mark all read" }).click();

    await expect(page.getByText("2 unread notifications")).toBeHidden();
    await expect(page.getByRole("button", { name: "Mark all read" })).toBeHidden();
  });

  test("preferences panel is reachable", async ({ page }) => {
    await mockNotificationCenter(page, "unread");

    await page.getByRole("button", { name: "Notification settings" }).click();

    await expect(
      page.getByRole("heading", { name: /notification preferences/i }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("notification-center-preferences.png", {
      animations: "disabled",
    });
  });
});
