import { e2eConfig } from '../../e2e/playwright.base';

export default e2eConfig({
  testDir: './src',
  outputDir: '../../dist/e2e-results/shell-e2e',
  reportDir: '../../dist/e2e-report/shell-e2e',
});
