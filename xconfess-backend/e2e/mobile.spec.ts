import { test, expect } from '@playwright/test';

test('Mobile navigation works', async ({ page }) => {
  await page.goto('/');

  await page.click('[data-testid="mobile-menu-btn"]');
  await page.click('[data-testid="nav-confessions"]');

  await expect(page).toHaveURL('/confessions');
});
