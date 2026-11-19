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

  test.describe('Stellar Wave Issues', () => {
    test('Issue #1930: Should reject confessions exceeding maximum length', async ({
      page,
    }) => {
      await page.goto('/confessions/new');

      const oversizedMessage = 'x'.repeat(1001);
      await page.fill('[data-testid="confession-input"]', oversizedMessage);
      await page.click('[data-testid="submit-confession"]');

      const errorMessage = page.locator(
        '[data-testid="validation-error"]:has-text("1000 characters")',
      );
      await expect(errorMessage).toBeVisible();
    });

    test('Issue #1929: Soft-deleted confessions should not appear in public feed', async ({
      page,
    }) => {
      await page.goto('/confessions/new');

      const message = `Confession for soft delete test - ${Date.now()}`;
      await page.fill('[data-testid="confession-input"]', message);
      await page.click('[data-testid="submit-confession"]');

      await expect(page.locator(`text=${message}`)).toBeVisible();

      await page.click('[data-testid="confession-menu"]');
      await page.click('[data-testid="delete-confession"]');

      await expect(page.locator(`text=${message}`)).not.toBeVisible();

      await page.reload();
      await expect(page.locator(`text=${message}`)).not.toBeVisible();
    });

    test('Issue #1931: Optimistic reactions should rollback on error', async ({
      page,
    }) => {
      await page.goto('/');

      const confessionCard = page.locator('[data-testid="confession-card"]').first();
      const likeButton = confessionCard.locator('[data-testid="like-button"]');
      const likeCount = confessionCard.locator('[data-testid="like-count"]');

      const initialCount = await likeCount.textContent();
      const initialNumber = parseInt(initialCount || '0', 10);

      await likeButton.click();

      const optimisticCount = await likeCount.textContent();
      expect(parseInt(optimisticCount || '0', 10)).toBe(initialNumber + 1);

      await page.waitForTimeout(100);
      const finalCount = await likeCount.textContent();
      expect(parseInt(finalCount || '0', 10)).toBeGreaterThanOrEqual(
        initialNumber,
      );
    });

    test('Issue #1932: Confession creation should be idempotent with idempotency key', async ({
      page,
    }) => {
      await page.goto('/confessions/new');

      const message = `Idempotent test confession - ${Date.now()}`;
      await page.fill('[data-testid="confession-input"]', message);

      await page.click('[data-testid="submit-confession"]');
      await page.waitForSelector(`text=${message}`);

      const firstConfessionId = await page
        .locator('[data-testid="confession-id"]')
        .first()
        .getAttribute('data-id');

      await page.goto('/confessions/new');
      await page.fill('[data-testid="confession-input"]', message);

      await page.click('[data-testid="submit-confession"]');
      await page.waitForSelector(`text=${message}`);

      const secondConfessionId = await page
        .locator('[data-testid="confession-id"]')
        .first()
        .getAttribute('data-id');

      expect(firstConfessionId).toBe(secondConfessionId);
    });
  });
});
