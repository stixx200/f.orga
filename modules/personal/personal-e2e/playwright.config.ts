import { e2eConfig } from '../../../e2e/playwright.base';

export default e2eConfig({
  testDir: './src',
  outputDir: '../../../dist/e2e-results/personal-e2e',
  reportDir: '../../../dist/e2e-report/personal-e2e',
});
