import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against a running instance with demo data (`npm run seed`).
 * Locally the installed Chrome is used; in CI the Playwright Chromium (`npx playwright install chromium`).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../dist/e2e-report' }]],
  outputDir: '../dist/e2e-results',
  use: {
    baseURL: process.env['FORGA_E2E_URL'] ?? 'http://localhost:4200',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 1440, height: 900 },
    channel: process.env['CI'] ? undefined : 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
