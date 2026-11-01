import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

/**
 * Shared Playwright defaults for every e2e project. Projects set `testDir`, `outputDir` and the report folder.
 * Tests share one instance and its demo data, so they run sequentially.
 */
export function e2eConfig(options: {
  testDir: string;
  outputDir: string;
  reportDir: string;
}): PlaywrightTestConfig {
  return defineConfig({
    testDir: options.testDir,
    testMatch: '**/*.e2e.ts',
    timeout: 120_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    forbidOnly: Boolean(process.env['CI']),
    reporter: process.env['CI']
      ? [['list'], ['github'], ['html', { open: 'never', outputFolder: options.reportDir }]]
      : [['list'], ['html', { open: 'never', outputFolder: options.reportDir }]],
    outputDir: options.outputDir,
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
}
