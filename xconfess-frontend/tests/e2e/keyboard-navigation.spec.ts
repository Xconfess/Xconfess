import { expect, Locator, Page, test } from '@playwright/test';

const testUser = {
  id: 'keyboard-a11y-user',
  username: 'keyboard-a11y',
  email: 'keyboard-a11y@example.com',
  role: 'user',
};

const thread = {
  confessionId: 'keyboard-a11y-thread',
  senderId: 'keyboard-a11y-sender',
  authorAnonymousUserId: 'keyboard-a11y-author',
  confessionMessage: 'Public thread fixture',
  lastMessage: 'PRIVATE_MESSAGE_FIXTURE_NOT_FOR_DISPLAY',
  lastMessageEncrypted: true,
  lastMessageAt: '2026-01-01T00:00:00.000Z',
  hasUnread: false,
  isAuthor: false,
};

async function expectVisibleKeyboardFocus(locator: Locator) {
  const hasVisibleFocus = await locator.evaluate((element) => {
    if (!element.matches(':focus-visible')) return false;

    const style = window.getComputedStyle(element);
    const hasOutline =
      style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    return hasOutline || style.boxShadow !== 'none';
  });

  expect(hasVisibleFocus).toBe(true);
}

async function tabTo(page: Page, locator: Locator) {
  await page.keyboard.press('Tab');
  await expect(locator).toBeFocused();
  await expectVisibleKeyboardFocus(locator);
}

async function mockMessageApis(
  page: Page,
  keyStatus: 'new' | 'registered' | 'error' = 'new',
) {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user: testUser }),
    });
  });

  await page.route('**/messages/keys/me', async (route) => {
    if (keyStatus === 'error') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'INTERNAL_KEY_SERVICE_DIAGNOSTIC' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        anonymousUserId: 'keyboard-a11y-anonymous-id',
        publicKey: keyStatus === 'registered' ? 'registered-public-key' : null,
        keyVersion: 1,
        hasBackup: false,
      }),
    });
  });

  await page.route('**/messages/keys', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/messages/threads**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ threads: keyStatus === 'new' ? [thread] : [] }),
    });
  });

  await page.route('**/messages?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ messages: [] }),
    });
  });
}

test.describe('Keyboard navigation regressions', () => {
  test('registration fields and actions follow form order with visible focus', async ({
    page,
  }) => {
    await page.goto('/register');

    const username = page.getByLabel('Username');
    const email = page.getByLabel('Email');
    const password = page.getByLabel('Password', { exact: true });
    const showPassword = page.getByRole('button', { name: 'Show password' });
    const confirmPassword = page.getByLabel('Confirm password');
    const createAccount = page.getByRole('button', { name: 'Create account' });
    const signIn = page.getByRole('button', { name: 'Sign in' });

    await username.focus();
    await tabTo(page, email);
    await tabTo(page, password);
    await tabTo(page, showPassword.nth(0));
    await tabTo(page, confirmPassword);
    await tabTo(page, showPassword.nth(1));
    await tabTo(page, createAccount);
    await tabTo(page, signIn);
  });

  test('confession composer exposes its controls in document order', async ({
    page,
  }) => {
    await page.route('**/api/confessions**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          confessions: [],
          meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasMore: false },
        }),
      });
    });

    await page.goto('/');

    const title = page.getByLabel(/Title/);
    const drafts = page.getByRole('button', { name: 'Manage drafts' });
    const preview = page.getByRole('button', { name: 'Switch to preview mode' });
    const bold = page.getByRole('button', { name: 'Bold' });
    const italic = page.getByRole('button', { name: 'Italic' });
    const insertLink = page.getByRole('button', { name: 'Insert link' });
    const insertEmoji = page.getByRole('button', { name: 'Insert emoji' });
    const confession = page.getByRole('textbox', { name: /^Confession/ });

    await expect(title).toBeVisible();
    await title.focus();
    await tabTo(page, drafts);
    await tabTo(page, preview);
    await tabTo(page, bold);
    await tabTo(page, italic);
    await tabTo(page, insertLink);
    await tabTo(page, insertEmoji);
    await tabTo(page, confession);
  });

  test('messaging composer is keyboard reachable and encrypted previews stay private', async ({
    page,
  }) => {
    await mockMessageApis(page);
    await page.goto('/messages');

    const threadButton = page.getByRole('button', { name: /Public thread fixture/ });
    await expect(threadButton).toBeVisible();
    await expect(threadButton).toContainText('[Encrypted message]');
    await expect(threadButton).not.toContainText('PRIVATE_MESSAGE_FIXTURE_NOT_FOR_DISPLAY');
    await threadButton.click();

    const composer = page.getByRole('textbox', { name: 'Send encrypted message' });
    const send = page.getByRole('button', { name: 'Send message' });
    await expect(composer).toBeEnabled();

    await composer.focus();
    await tabTo(page, send);
  });

  test('key-recovery dialog traps focus in order and Escape restores the trigger', async ({
    page,
  }) => {
    await mockMessageApis(page, 'registered');
    await page.goto('/messages');

    const trigger = page.getByRole('button', { name: 'Start fresh instead' });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole('dialog', {
      name: 'Start fresh with new encryption keys?',
    });
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    const confirm = dialog.getByRole('button', { name: 'Start fresh' });
    const close = dialog.getByRole('button', { name: 'Close' });

    await expect(dialog).toBeVisible();
    await expect(cancel).toBeFocused();
    await expectVisibleKeyboardFocus(cancel);
    await tabTo(page, confirm);
    await tabTo(page, close);
    await tabTo(page, cancel);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('key initialization errors show a safe message, not server diagnostics', async ({
    page,
  }) => {
    await mockMessageApis(page, 'error');
    await page.goto('/messages');

    await expect(
      page.getByText('Unable to initialize end-to-end encryption on this device.'),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'INTERNAL_KEY_SERVICE_DIAGNOSTIC',
    );
  });
});