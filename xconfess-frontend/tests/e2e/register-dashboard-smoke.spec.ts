import { expect, test, type Page } from '@playwright/test';

/**
 * register-dashboard-smoke.spec.ts
 *
 * Smoke test covering the registration-to-dashboard authenticated flow (#1732).
 * Uses disposable credentials and mocked API responses so tests run hermetically
 * without polluting external/production state.
 */

test.describe('Register-to-Dashboard Smoke Flow (#1732)', () => {
  test.beforeEach(async ({ page }) => {
    // Generate unique disposable credentials per test run
    const uniqueId = Date.now();
    const disposableUser = {
      id: `user-${uniqueId}`,
      username: `smoke_user_${uniqueId}`,
      email: `smoke_${uniqueId}@example.com`,
      role: 'user',
      is_active: true,
    };

    let isAuthenticated = false;

    // Intercept Registration API
    await page.route('**/api/auth/register', async (route) => {
      isAuthenticated = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user: disposableUser,
          anonymousUserId: `anon-${uniqueId}`,
          token: `token-${uniqueId}`,
          message: 'User registered successfully',
        }),
      });
    });

    // Intercept Session API
    await page.route('**/api/auth/session', async (route) => {
      if (!isAuthenticated) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ authenticated: false, message: 'Not authenticated' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          user: disposableUser,
          anonymousUserId: `anon-${uniqueId}`,
        }),
      });
    });

    // Intercept Dashboard metrics / feed queries
    await page.route('**/api/confessions*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          total: 0,
          page: 1,
          limit: 10,
        }),
      });
    });

    await page.route('**/api/notifications*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notifications: [], unreadCount: 0 }),
      });
    });
  });

  test('fills registration form with disposable credentials and navigates to dashboard', async ({ page }) => {
    const timestamp = Date.now();
    const testUsername = `user_${timestamp}`;
    const testEmail = `user_${timestamp}@example.com`;
    const testPassword = 'Password123!';

    // 1. Navigate to Register page
    await page.goto('/register');
    await expect(page).toHaveURL(/\/register/);

    // 2. Fill registration inputs
    await page.fill('input#username, input[name="username"]', testUsername);
    await page.fill('input#email, input[name="email"]', testEmail);
    await page.fill('input#password, input[name="password"]', testPassword);
    await page.fill('input#confirmPassword, input[name="confirmPassword"]', testPassword);

    // 3. Submit registration form
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // 4. Verify transition and redirection to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // 5. Verify authenticated dashboard state is presented
    const dashboardElement = page.locator(
      'h1:has-text("Dashboard"), [data-testid="dashboard-view"], nav:has-text("Logout"), nav:has-text("Dashboard")',
    );
    await expect(dashboardElement.first()).toBeVisible({ timeout: 10000 });
  });
});
