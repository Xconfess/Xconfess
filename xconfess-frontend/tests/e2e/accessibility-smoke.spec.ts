import axe from 'axe-core';
import { expect, Page, test } from '@playwright/test';

declare global {
  interface Window {
    axe: typeof axe;
  }
}

const testUser = {
  id: 'a11y-smoke-user',
  username: 'a11y-smoke',
  email: 'a11y-smoke@example.com',
  role: 'admin',
};

const analytics = {
  overview: {
    totalUsers: 0,
    activeUsers: 0,
    totalConfessions: 0,
    totalReports: 0,
    bannedUsers: 0,
    hiddenConfessions: 0,
    deletedConfessions: 0,
  },
  reports: { byStatus: [], byType: [] },
  trends: { confessionsOverTime: [] },
  period: {
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-01-31T00:00:00.000Z',
  },
};

async function mockPublicApis(page: Page) {
  await page.route('**/api/confessions**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        confessions: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasMore: false },
      }),
    });
  });
}

async function mockAuthenticatedAdminApis(page: Page) {
  await page.route('**/api/auth/session', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user: testUser }),
    });
  });
  await page.route('**/api/admin/analytics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(analytics),
    });
  });
  await page.route('**/api/admin/reports/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pendingCount: 0,
        oldestUnresolvedAge: null,
        resolvedTodayCount: 0,
      }),
    });
  });
}

async function expectNoSeriousAccessibilityViolations(
  page: Page,
  route: string,
) {
  await page.addScriptTag({ content: axe.source });

  const violations = await page.evaluate(async () => {
    const results = await window.axe.run(document);
    return results.violations
      .filter(
        (violation) =>
          violation.impact === 'critical' || violation.impact === 'serious',
      )
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.map((node) => node.target),
      }));
  });

  expect(
    violations,
    `Critical or serious axe-core violations on ${route}:\n${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
}

test.describe('Accessibility smoke', () => {
  test('public home page has no critical or serious violations', async ({
    page,
  }) => {
    await mockPublicApis(page);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /say it\. anonymously\./i }),
    ).toBeVisible();

    await expectNoSeriousAccessibilityViolations(page, '/');
  });

  test('login page has no critical or serious violations', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    await expectNoSeriousAccessibilityViolations(page, '/login');
  });

  test('authenticated admin dashboard has no critical or serious violations', async ({
    page,
  }) => {
    await mockAuthenticatedAdminApis(page);
    await page.goto('/admin/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Platform health' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Report Queue Health' })).toBeVisible();

    await expectNoSeriousAccessibilityViolations(page, '/admin/dashboard');
  });
});
