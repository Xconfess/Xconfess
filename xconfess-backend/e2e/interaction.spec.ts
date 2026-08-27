import { test, expect } from '@playwright/test';
import { loginUser } from './test-helper';




test.describe('Confession Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, 'test@example.com', 'Password123!');
  });

  test('User can post a confession', async ({ page }) => {
    await page.goto('/confessions/new');

    await page.fill(
      '[data-testid="confession-input"]',
      'This is my anonymous confession',
    );

    await page.click('[data-testid="submit-confession"]');

    await expect(page.locator('text=anonymous confession')).toBeVisible();
  });

  test('User can delete confession', async ({ page }) => {
    await page.click('[data-testid="confession-menu"]');
    await page.click('[data-testid="delete-confession"]');

    await expect(
      page.locator('text=anonymous confession'),
    ).not.toBeVisible();
  });
});
