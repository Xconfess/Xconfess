import { Page, request } from '@playwright/test';

export async function registerUser(page: Page, email: string, password: string) {
  await page.goto('/register');
  await page.fill('[data-testid="email"]', email);
  await page.fill('[data-testid="password"]', password);
  await page.click('[data-testid="register-btn"]');
}

export async function loginUser(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', email);
  await page.fill('[data-testid="password"]', password);
  await page.click('[data-testid="login-btn"]');
}

export async function apiLogin(email: string, password: string) {
  const context = await request.newContext();
  const res = await context.post('/api/auth/login', {
    data: { email, password },
  });
  return res.json();
}
