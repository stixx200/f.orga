import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const baseURL = process.env['FORGA_E2E_URL'] ?? 'http://localhost:4200';
/** Boot a production-like instance when nothing answers at the e2e URL (Atomizer shards on Agents). */
const boot =
  process.env['FORGA_E2E_BOOT'] !== '0' &&
  // Local `pnpm run e2e` against `pnpm run dev` (4200): do not spawn e2e-serve unless asked.
  (Boolean(process.env['CI']) || process.env['FORGA_E2E_BOOT'] === '1' || baseURL.includes(':3100'));

/**
 * Shared Playwright defaults for every e2e project. Projects set `testDir`, `outputDir` and the report folder.
 * Tests within a project share one instance (`workers: 1`). In CI each Atomizer shard boots a fresh e2e instance
 * (no `reuseExistingServer`) so login locks and demo mutations do not leak across shards on the same agent.
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
    retries: process.env['CI'] ? 1 : 0,
    forbidOnly: Boolean(process.env['CI']),
    reporter: process.env['CI']
      ? [['list'], ['github'], ['html', { open: 'never', outputFolder: options.reportDir }]]
      : [['list'], ['html', { open: 'never', outputFolder: options.reportDir }]],
    outputDir: options.outputDir,
    use: {
      baseURL,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      viewport: { width: 1440, height: 900 },
      channel: process.env['FORGA_E2E_CHANNEL'] || undefined,
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
    },
    ...(boot
      ? {
          webServer: {
            command: 'pnpm exec tsx --tsconfig tools/tsconfig.json tools/e2e-serve.mts',
            cwd: ROOT,
            url: `${baseURL.replace(/\/$/, '')}/api/core/setup`,
            // The URL answers once the server listens, before the demo data is seeded: wait for seed to finish.
            // In CI e2e-serve always boots fresh (never "instance already running").
            wait: { stdout: /e2e-serve: ready at/ },
            reuseExistingServer: !process.env['CI'],
            timeout: 900_000,
          },
        }
      : {}),
  });
}
