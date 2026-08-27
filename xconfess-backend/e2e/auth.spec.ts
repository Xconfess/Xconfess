import { test, expect } from '@playwright/test';
import { loginUser } from './test-helper';



test.describe('Authentication Flow', () => {
  test('User can login and logout', async ({ page }) => {
    await loginUser(page, 'test@example.com', 'Password123!');

    await expect(page).toHaveURL('/dashboard');

     await page.click('[data-testid="logout-btn"]');
    await expect(page).toHaveURL('/login');
  });
});
