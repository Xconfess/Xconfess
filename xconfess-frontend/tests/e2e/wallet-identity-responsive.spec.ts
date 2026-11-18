import { Keypair } from '@stellar/stellar-sdk';
import { expect, test } from '@playwright/test';

test('wallet identity wraps and keeps actions reachable on narrow, enlarged layouts', async ({
  page,
}) => {
  const wallet = {
    version: 1,
    cipher: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    salt: Buffer.alloc(16).toString('base64'),
    iv: Buffer.alloc(12).toString('base64'),
    ciphertext: Buffer.alloc(16).toString('base64'),
    publicKey: Keypair.random().publicKey(),
    network: 'testnet',
    createdAt: new Date().toISOString(),
  };

  await page.addInitScript((storedWallet) => {
    localStorage.setItem('xconfess.embedded-wallet.v1', JSON.stringify(storedWallet));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  }, wallet);
  await page.goto('/wallet/receive');
  await expect(page.getByText(wallet.publicKey)).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 800 });
    const address = page.getByText(wallet.publicKey);
    const copyButton = page.getByRole('button', { name: 'Copy address' });
    const shareButton = page.getByRole('button', { name: 'Share address' });

    await expect(address).toBeVisible();
    await expect(copyButton).toBeVisible();
    await expect(shareButton).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await address.boundingBox())?.right).toBeLessThanOrEqual(width);

    await copyButton.click();
    await expect(page.getByRole('status')).toHaveText('Address copied.');
  }
});