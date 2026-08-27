import { test, expect } from '@playwright/test';

test.describe('Dashboard Mobile Navigation', () => {
  test('should have accessible touch targets on mobile', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check mobile menu button meets 44px minimum
    const menuButton = page.locator('button[aria-label="Open menu"]');
    await expect(menuButton).toBeVisible();
    
    const box = await menuButton.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  });

  test('should open mobile navigation drawer', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Open mobile menu
    await page.click('button[aria-label="Open menu"]');
    
    // Verify drawer is visible
    const drawer = page.locator('#mobile-navigation');
    await expect(drawer).toBeVisible();
    
    // Verify nav items have sufficient touch targets
    const navItems = drawer.locator('nav a');
    const count = await navItems.count();
    
    for (let i = 0; i < count; i++) {
      const item = navItems.nth(i);
      const box = await item.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('should close mobile navigation on link click', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Open mobile menu
    await page.click('button[aria-label="Open menu"]');
    
    // Click a nav link
    await page.click('nav a[href="/profile"]');
    
    // Verify drawer is closed
    const drawer = page.locator('#mobile-navigation');
    await expect(drawer).not.toBeVisible();
  });

  test('should close mobile navigation on escape key', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Open mobile menu
    await page.click('button[aria-label="Open menu"]');
    
    // Press escape
    await page.keyboard.press('Escape');
    
    // Verify drawer is closed
    const drawer = page.locator('#mobile-navigation');
    await expect(drawer).not.toBeVisible();
  });
});

test.describe('Dashboard Mobile Layout', () => {
  test('should have responsive container padding', async ({ page }) => {
    await page.goto('/dashboard');
    
    const main = page.locator('main');
    await expect(main).toBeVisible();
    
    // Verify responsive padding classes are applied
    const className = await main.getAttribute('class');
    expect(className).toContain('px-4');
    expect(className).toContain('sm:px-6');
    expect(className).toContain('md:px-8');
  });

  test('should display stats grid responsively', async ({ page }) => {
    await page.goto('/dashboard');
    
    const statsGrid = page.locator('.grid');
    await expect(statsGrid).toBeVisible();
    
    // Verify grid has responsive classes
    const className = await statsGrid.getAttribute('class');
    expect(className).toContain('grid-cols-2');
    expect(className).toContain('sm:grid-cols-3');
  });
});

test.describe('Profile Mobile Layout', () => {
  test('should have responsive container', async ({ page }) => {
    await page.goto('/profile');
    
    const container = page.locator('.max-w-4xl');
    await expect(container).toBeVisible();
    
    // Verify responsive padding
    const className = await container.getAttribute('class');
    expect(className).toContain('px-4');
    expect(className).toContain('sm:px-6');
  });
});

test.describe('Search Mobile Layout', () => {
  test('should have accessible filter button', async ({ page }) => {
    await page.goto('/search');
    
    const filterButton = page.locator('button:has-text("Filters")');
    await expect(filterButton).toBeVisible();
    
    // Verify touch target size
    const box = await filterButton.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('should open filter sidebar on mobile', async ({ page }) => {
    await page.goto('/search');
    
    // Open filters
    await page.click('button:has-text("Filters")');
    
    // Verify sidebar is visible
    const sidebar = page.locator('#search-filters-sidebar');
    await expect(sidebar).toBeVisible();
  });
});

test.describe('Analytics Mobile Layout', () => {
  test('should display metrics grid responsively', async ({ page }) => {
    await page.goto('/analytics');
    
    const metricsGrid = page.locator('.grid').first();
    await expect(metricsGrid).toBeVisible();
    
    // Verify responsive grid classes
    const className = await metricsGrid.getAttribute('class');
    expect(className).toContain('grid-cols-1');
    expect(className).toContain('sm:grid-cols-2');
    expect(className).toContain('md:grid-cols-3');
    expect(className).toContain('lg:grid-cols-4');
  });
});
