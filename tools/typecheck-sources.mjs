// Type-checks every project from its sources with `tsc --noEmit`, in parallel.
// `tsc --build` via Nx treats a project as up to date when only an upstream project changed,
// so errors caused by changed contracts can slip through; this check rebuilds declaration
// outputs itself (not via the Nx cache) and then type-checks every config with `--noEmit`.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const roots = ['apps', 'libs/core', 'libs/web', ...readdirSync('modules').map((m) => join('modules', m))];
const projects = roots.flatMap((root) => readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(root, d.name)));
const configs = projects.flatMap((dir) => ['tsconfig.app.json', 'tsconfig.lib.json', 'tsconfig.spec.json'].map((c) => join(dir, c)).filter(existsSync));
// Apps without app/lib configs (the web apps) keep their sources in tsconfig.json.
for (const dir of projects) if (!configs.some((c) => c.startsWith(`${dir}/`)) && existsSync(join(dir, 'tsconfig.json'))) configs.push(join(dir, 'tsconfig.json'));
// The Playwright end-to-end tests.
configs.push('e2e/tsconfig.json');

// Composite project references need `.d.ts` outputs. `nx affected` may skip every build on a
// docs-only change, so emit them here from source before `--noEmit` (TS6305 otherwise).
const buildConfigs = configs.filter((c) => /tsconfig\.(lib|app)\.json$/.test(c));
try {
  await run('npx', ['tsc', '-b', ...buildConfigs], { maxBuffer: 16 * 1024 * 1024 });
} catch (error) {
  console.error(error.stdout || error.message);
  process.exit(1);
}

const failures = [];
const queue = [...configs];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let config = queue.shift(); config; config = queue.shift()) {
      try {
        await run('npx', ['tsc', '--noEmit', '-p', config], { maxBuffer: 16 * 1024 * 1024 });
      } catch (error) {
        failures.push(`${config}\n${error.stdout || error.message}`);
      }
    }
  }),
);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Type-checked ${configs.length} configurations.`);
