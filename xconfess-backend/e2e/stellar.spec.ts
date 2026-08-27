import { test, expect } from '@playwright/test';

test('User can connect Stellar wallet', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).stellarWallet = {
      connect: async () => ({
        publicKey: 'GTESTPUBLICKEY123',
      }),
    };
  });

  await page.goto('/wallet');

  await page.click('[data-testid="connect-wallet"]');

  await expect(page.locator('text=GTESTPUBLICKEY123')).toBeVisible();
});

test('User sees error on malformed transaction rejection', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).stellarWallet = {
      connect: async () => ({
        publicKey: 'GTESTPUBLICKEY123',
      }),
      signTransaction: async () => {
        throw new Error('User rejected the transaction');
      },
    };
  });

  await page.goto('/wallet');
  await page.click('[data-testid="connect-wallet"]');
  await page.click('[data-testid="submit-transaction"]');

  await expect(
    page.locator('text=User rejected the transaction'),
  ).toBeVisible();
});
