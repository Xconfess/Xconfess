import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const e2eBaseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
const useExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_SERVER === 'true' && process.env.CI !== 'true';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    headless: process.env.CI === 'true',
    baseURL: e2eBaseURL,
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
  ...(useExternalServer
    ? {}
    : {
        webServer: {
          command: `npm run dev -- --hostname 127.0.0.1 --port ${e2ePort}`,
          env: {
            ...process.env,
            APP_URL: process.env.APP_URL ?? e2eBaseURL,
            BACKEND_API_URL:
              process.env.BACKEND_API_URL ?? 'http://127.0.0.1:4001',
            NEXT_PUBLIC_API_URL:
              process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4001',
            NEXT_PUBLIC_WS_URL:
              process.env.NEXT_PUBLIC_WS_URL ?? 'ws://127.0.0.1:4001',
          },
          port: e2ePort,
          reuseExistingServer,
          timeout: 120000,
        },
      }),
});
