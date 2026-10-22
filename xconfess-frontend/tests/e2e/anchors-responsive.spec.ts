import { expect, test } from "@playwright/test";

const confessionId =
  "a4c28d479c2c4be59c17d12d3a71b94c8a6012f9e451bb73a09f11bb5ec3c4d7";
const contractId =
  "CDLZJ2QJ4V4M3K4J7Q6X5W2N4R8M9P1T6Y3H2A5B7C9D4E6F8G1J3K5L7M9";

test("anchor identifiers and actions remain reachable on narrow and enlarged-text layouts", async ({
  page,
}) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: {
          id: "user-1",
          email: "member@example.com",
          username: "member",
          role: "user",
          is_active: true,
        },
      }),
    });
  });

  await page.route("**/stellar/anchors*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            confessionId,
            stellarTxHash: "",
            stellarHash: "",
            anchoredAt: "2026-10-21T12:00:00.000Z",
            contractId,
            stellarExplorerUrl: "",
            message: "Responsive anchor fixture",
            status: "failed",
          },
        ],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      }),
    });
  });

  await page.goto("/anchors");
  const region = page.getByRole("region", { name: "Anchors table" });
  await expect(region).toBeVisible();

  for (const width of [320, 360, 375, 390, 414]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(region).toBeVisible();
    await expect(
      page.locator(`code[aria-label="Confession ID ${confessionId}"]`),
    ).toHaveText(confessionId);

    const dimensions = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      tableScrollWidth: document.querySelector('[role="region"][aria-label="Anchors table"]')?.scrollWidth,
      tableClientWidth: document.querySelector('[role="region"][aria-label="Anchors table"]')?.clientWidth,
    }));
    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.tableScrollWidth).toBeGreaterThan(dimensions.tableClientWidth ?? 0);
    expect(await region.getAttribute("tabindex")).toBe("0");

    await region.focus();
    expect(await region.evaluate((element) => document.activeElement === element)).toBe(
      true,
    );
    const retryButton = page.getByRole("button", { name: "Retry" });
    await retryButton.focus();
    await expect(retryButton).toBeFocused();
  }

  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.locator(`code[aria-label="Contract ID ${contractId}"]`)).toHaveText(
    contractId,
  );
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  const enlargedTextPageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(enlargedTextPageWidth).toBeLessThanOrEqual(320);
});
