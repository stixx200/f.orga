/**
 * Runs the Playwright end-to-end tests against a fresh, production-like instance:
 *
 * 1. builds server, shell and module frontends (Nx cache; skip with `--no-build`),
 * 2. recreates the database `forga_e2e` (`FORGA_E2E_DATABASE_URL`),
 * 3. starts the built server on port 3100 (`FORGA_E2E_PORT`) serving the built frontends like the Docker image
 *    (`FORGA_WEB_DIR` with `shell` and `modules/<id>`), with `NODE_ENV=production`, `FORGA_STAGE=development`
 *    (`FORGA_E2E_STAGE`), a fresh `FORGA_SECRET_KEY` and setup token, e-mails in memory, the schedulers off,
 *    backups to `dist/e2e/backups` (`FORGA_BACKUP_ROOT`; PostgreSQL 17 tools from `FORGA_PG_BIN` or the `PATH`) and
 *    calendar imports from local addresses allowed (`FORGA_IMPORT_URL_ALLOW_PRIVATE`),
 * 4. fills it with `npm run seed`,
 * 5. runs `playwright test` (further arguments go to Playwright) and stops the server.
 *
 *   npm run e2e:fresh                              all tests
 *   npm run e2e:fresh -- e2e/shell.e2e.ts --headed  one file, browser visible
 *   npm run e2e:fresh -- --serve                    only the instance, keeps running until Ctrl+C;
 *                                                   then `npm run e2e -- …` with the printed variables
 *   npm run e2e:fresh -- --serve --reuse            the instance again on the data of the last run (no new database,
 *                                                   no seed)
 *
 * Everything the run writes goes to `dist/e2e` (server log, server key, secrets of the second factor), the report to
 * `dist/e2e-report`.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'dist/e2e');
const DATABASE_URL = process.env['FORGA_E2E_DATABASE_URL'] ?? 'postgresql://forga:forga@localhost:5433/forga_e2e';
const PORT = Number(process.env['FORGA_E2E_PORT'] ?? 3100);
const URL = `http://localhost:${PORT}`;
const TOTP_FILE = join(OUT, 'totp.json');
/** `FORGA_SECRET_KEY` of the instance: the secrets of the second factor are encrypted with it. */
const KEY_FILE = join(OUT, 'secret-key');
/** `FORGA_BACKUP_ROOT` of the instance (emptied for a fresh run). */
const BACKUP_ROOT = join(OUT, 'backups');

const args = process.argv.slice(2);
const serveOnly = args.includes('--serve');
const build = !args.includes('--no-build');
const reuse = args.includes('--reuse');
const playwrightArgs = args.filter((a) => !['--serve', '--no-build', '--reuse'].includes(a));

const started = Date.now();
const elapsed = () => `${Math.round((Date.now() - started) / 1000)} s`;

/** Runs a command with inherited output; fails on a non-zero exit code. */
function run(command: string, commandArgs: string[], env: NodeJS.ProcessEnv = {}): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(command, commandArgs, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', fail);
    child.on('exit', (code, signal) => (code === 0 ? done() : fail(new Error(`${command} ${commandArgs.join(' ')}: ${signal ?? `exit code ${code}`}`))));
  });
}

/** Drops and creates the database of the instance. */
async function recreateDatabase(): Promise<void> {
  const url = new globalThis.URL(DATABASE_URL);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-z0-9_]+$/.test(name) || name === 'forga') throw new Error(`Refusing to recreate the database "${name}": use an own database for the e2e tests.`);
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`drop database if exists ${name} with (force)`);
    await client.query(`create database ${name}`);
  } finally {
    await client.end();
  }
  console.log(`Database ${name} created.`);
}

/**
 * The web directory as in the Docker image: `shell` and `modules/<id>`, linked to the build outputs. It lies in the
 * system's temporary directory: Express does not send files from paths with a dot folder (e.g. a worktree in
 * `.claude/worktrees`), and the shell's `index.html` answers every route.
 */
function webDirectory(): string {
  const web = mkdtempSync(join(tmpdir(), 'forga-e2e-web-'));
  mkdirSync(join(web, 'modules'));
  symlinkSync(join(ROOT, 'apps/shell/dist'), join(web, 'shell'));
  for (const id of readdirSync(join(ROOT, 'modules'))) {
    const dist = join(ROOT, 'modules', id, `${id}-web`, 'dist');
    if (existsSync(dist)) symlinkSync(dist, join(web, 'modules', id));
  }
  return web;
}

function startServer(env: NodeJS.ProcessEnv): ChildProcess {
  const log = createWriteStream(join(OUT, 'server.log'));
  const server = spawn(process.execPath, ['apps/server/dist/main.js'], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  return server;
}

/** Waits until the server answers; fails when it exits before. */
async function waitForServer(server: ChildProcess): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`The server exited with code ${server.exitCode}: see ${join(OUT, 'server.log')}`);
    try {
      if ((await fetch(`${URL}/api/core/setup`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The server did not start within two minutes: see ${join(OUT, 'server.log')}`);
}

async function main(): Promise<void> {
  if (build) await run('npx', ['nx', 'run-many', '-t', 'build', '-p', '@forga/server', 'shell', 'tag:type:web'], { NX_DAEMON: 'false' });
  mkdirSync(OUT, { recursive: true });
  if (reuse && !existsSync(KEY_FILE)) throw new Error('--reuse needs the data of an earlier run: start without it first.');
  if (!reuse) {
    rmSync(TOTP_FILE, { force: true });
    rmSync(BACKUP_ROOT, { recursive: true, force: true });
    writeFileSync(KEY_FILE, randomBytes(32).toString('base64'), { mode: 0o600 });
    await recreateDatabase();
  }

  mkdirSync(BACKUP_ROOT, { recursive: true });
  const setupToken = randomBytes(16).toString('hex');
  const web = webDirectory();
  const server = startServer({
    NODE_ENV: 'production',
    PORT: String(PORT),
    DATABASE_URL,
    FORGA_WEB_DIR: web,
    FORGA_STAGE: process.env['FORGA_E2E_STAGE'] ?? 'development',
    FORGA_SECRET_KEY: readFileSync(KEY_FILE, 'utf8'),
    FORGA_SETUP_TOKEN: setupToken,
    // Links of info terminals and e-mails.
    FORGA_PUBLIC_URL: URL,
    FORGA_MAIL_TRANSPORT: 'memory',
    FORGA_DIGEST_SCHEDULER: 'off',
    FORGA_RETENTION_SCHEDULER: 'off',
    FORGA_STATUS_SCHEDULER: 'off',
    FORGA_PRIVACY_SCHEDULER: 'off',
    FORGA_BACKUP_SCHEDULER: 'off',
    FORGA_MAINTENANCE_FILE: join(OUT, 'maintenance'),
    // Backups go to a folder of the run; the PostgreSQL tools come from `FORGA_PG_BIN` or the `PATH`.
    FORGA_BACKUP_ROOT: BACKUP_ROOT,
    // The iCal import test serves its calendar from the test runner (localhost).
    FORGA_IMPORT_URL_ALLOW_PRIVATE: 'true',
  });
  const stop = () => {
    if (server.exitCode === null) server.kill('SIGTERM');
    rmSync(web, { recursive: true, force: true });
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      stop();
      process.exit(130);
    });
  }
  process.on('exit', stop);

  await waitForServer(server);
  console.log(`Server running at ${URL} after ${elapsed()} (log: ${join(OUT, 'server.log')}).`);
  // Seed and tests compute local dates in the time zone of the browser (Europe/Berlin), also on a CI runner in UTC.
  const env = { FORGA_URL: URL, FORGA_E2E_URL: URL, FORGA_TOTP_FILE: TOTP_FILE, TZ: 'Europe/Berlin' };
  if (!reuse) {
    await run('npm', ['run', 'seed'], { ...env, FORGA_SETUP_TOKEN: setupToken });
    console.log(`Demo data ready after ${elapsed()}.`);
  }

  if (serveOnly) {
    console.log(`\nInstance ready. In another terminal:\n  FORGA_E2E_URL=${URL} FORGA_TOTP_FILE=${TOTP_FILE} TZ=Europe/Berlin npm run e2e -- <files or options>\nCtrl+C stops the server.`);
    await new Promise<void>((done) => server.on('exit', () => done()));
    return;
  }
  try {
    await run('npx', ['playwright', 'test', '-c', 'e2e/playwright.config.ts', ...playwrightArgs], env);
  } finally {
    stop();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
