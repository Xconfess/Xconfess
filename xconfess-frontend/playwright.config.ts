import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    headless: process.env.CI === 'true',
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /public-pages-smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'wave-demo',
      testMatch: /wave-demo-journey\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      timeout: 60_000,
      retries: process.env.CI === 'true' ? 1 : 0,
    },
    },
    {
      name: 'mobile-portrait',
      use: { ...devices['iPhone SE'] },
    },
    {
      name: 'mobile-landscape',
      use: { ...devices['iPhone 12 Pro'], viewport: { width: 667, height: 375 } },
    },
    {
      name: 'tablet-portrait',
      use: { ...devices['iPad Mini'] },
    },
    {
      name: 'tablet-landscape',
      use: { ...devices['iPad Mini'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    env: {
      ...process.env,
      BACKEND_API_URL: process.env.BACKEND_API_URL ?? 'http://127.0.0.1:4001',
      NEXT_PUBLIC_API_URL:
        process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4001',
      NEXT_PUBLIC_WS_URL:
        process.env.NEXT_PUBLIC_WS_URL ?? 'ws://127.0.0.1:4001',
    },
    port: 3000,
    reuseExistingServer: process.env.CI !== 'true',
  },
});
