import { expect, test, type Locator } from '@playwright/test';

/**
 * Mobile auth visual regression coverage.
 *
 * Baselines are stored beside this spec in snapshots/<project-name>/ and are
 * updated intentionally with `npx playwright test tests/e2e/auth-mobile.spec.ts
 * --update-snapshots`. The same tests run for the configured mobile portrait
 * and landscape projects.
 */
test.describe('Mobile auth pages', () => {
  test('login keeps both auth actions visible without overlap', async ({ page }) => {
    await page.goto('/login');

    const signIn = page.getByRole('button', { name: 'Sign in' });
    const createAccount = page.getByRole('button', { name: 'Create account' });

    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(signIn).toBeVisible();
    await expect(createAccount).toBeVisible();
    await expectNoOverlap(signIn, createAccount);
    await expect(page).toHaveScreenshot('auth-login-mobile.png', {
      fullPage: true,
    });

    await createAccount.click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
  });

  test('register keeps both auth actions visible without overlap', async ({ page }) => {
    await page.goto('/register');

    const createAccount = page.getByRole('button', { name: 'Create account' });
    const signIn = page.getByRole('button', { name: 'Sign in', exact: true });

    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await expect(createAccount).toBeVisible();
    await expect(signIn).toBeVisible();
    await expectNoOverlap(createAccount, signIn);
    await expect(page).toHaveScreenshot('auth-register-mobile.png', {
      fullPage: true,
    });

    await signIn.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  });
});

async function expectNoOverlap(
  first: Locator,
  second: Locator,
) {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();

  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();

  if (!firstBox || !secondBox) return;

  const overlaps =
    firstBox.x < secondBox.x + secondBox.width &&
    firstBox.x + firstBox.width > secondBox.x &&
    firstBox.y < secondBox.y + secondBox.height &&
    firstBox.y + firstBox.height > secondBox.y;

  expect(overlaps).toBe(false);
}
