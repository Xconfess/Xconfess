import { expect, test } from "@playwright/test";

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 667 },
};

const PAGES = [
  { name: "feed", path: "/", viewports: ["desktop", "mobile"] },
  { name: "confession-detail", path: "/confessions/1", viewports: ["desktop", "mobile"] },
  { name: "admin-dashboard", path: "/admin/dashboard", viewports: ["desktop"] },
  { name: "admin-reports", path: "/admin/reports", viewports: ["desktop"] },
  { name: "composer", path: "/compose", viewports: ["desktop", "mobile"] },
];

for (const page of PAGES) {
  for (const viewportName of page.viewports) {
    test(`${page.name} @ ${viewportName}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: VIEWPORTS[viewportName],
      });
      const pageObj = await context.newPage();
      await pageObj.goto(page.path, { waitUntil: "networkidle" });
      await expect(pageObj).toHaveScreenshot(`${page.name}-${viewportName}.png`);
      await context.close();
    });
  }
}
