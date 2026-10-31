import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against a running instance with demo data (`pnpm run seed`); `pnpm run e2e:fresh` starts a fresh one.
 * Browser: the Playwright Chromium (`pnpm exec playwright install chromium`), locally and in CI; `FORGA_E2E_CHANNEL=chrome`
 * uses an installed Chrome instead.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // The tests share one instance and its demo data.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? [['list'], ['github'], ['html', { open: 'never', outputFolder: '../dist/e2e-report' }]] : [['list'], ['html', { open: 'never', outputFolder: '../dist/e2e-report' }]],
  outputDir: '../dist/e2e-results',
  use: {
    baseURL: process.env['FORGA_E2E_URL'] ?? 'http://localhost:4200',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 1440, height: 900 },
    channel: process.env['FORGA_E2E_CHANNEL'] || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
