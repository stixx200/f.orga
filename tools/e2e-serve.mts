/**
 * Boots (or reuses) a production-like e2e instance for Playwright `webServer` / Nx Agent shards:
 * build outputs must already exist (Nx `dependsOn` / remote cache); recreates the DB, starts the server, seeds, then
 * stays alive until killed. If the instance already answers, keeps the process alive so Playwright has a managed
 * `webServer` (or exits when `FORGA_E2E_SERVE_EXIT_IF_UP=1`).
 *
 * In CI the Node server outlives this process (Playwright stops `webServer` after each Atomizer shard) so later shards
 * on the same agent hit `reuseExistingServer` instead of reseeding.
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
const PORT = Number(
  process.env['FORGA_E2E_PORT'] ??
    (() => {
      try {
        return new globalThis.URL(process.env['FORGA_E2E_URL'] ?? 'http://localhost:3100').port || 3100;
      } catch {
        return 3100;
      }
    })(),
);
const URL = process.env['FORGA_E2E_URL'] ?? `http://localhost:${PORT}`;
const TOTP_FILE = join(OUT, 'totp.json');
const TOTP_USED_FILE = join(OUT, 'totp-used.json');
const KEY_FILE = join(OUT, 'secret-key');
const BACKUP_ROOT = join(OUT, 'backups');
const READY_FILE = join(OUT, 'ready');
const KEEP_SERVER = Boolean(process.env['CI']) || process.env['FORGA_E2E_KEEP'] === '1';

async function alreadyUp(): Promise<boolean> {
  try {
    return (await fetch(`${URL}/api/core/setup`)).ok;
  } catch {
    return false;
  }
}

async function recreateDatabase(): Promise<void> {
  const url = new globalThis.URL(DATABASE_URL);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-z0-9_]+$/.test(name) || name === 'forga') throw new Error(`Refusing to recreate the database "${name}".`);
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`drop database if exists ${name} with (force)`);
    await client.query(`create database ${name}`);
  } finally {
    await client.end();
  }
}

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
  const server = spawn(process.execPath, ['apps/server/dist/main.js'], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: KEEP_SERVER,
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  if (KEEP_SERVER) server.unref();
  return server;
}

async function waitForServer(server: ChildProcess): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`The server exited with code ${server.exitCode}: see ${join(OUT, 'server.log')}`);
    if (await alreadyUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The server did not start within two minutes: see ${join(OUT, 'server.log')}`);
}

function run(command: string, commandArgs: string[], env: NodeJS.ProcessEnv = {}): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(command, commandArgs, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', fail);
    child.on('exit', (code, signal) => (code === 0 ? done() : fail(new Error(`${command} ${commandArgs.join(' ')}: ${signal ?? `exit code ${code}`}`))));
  });
}

async function main(): Promise<void> {
  if (await alreadyUp()) {
    console.log(`e2e-serve: instance already running at ${URL}`);
    if (process.env['FORGA_E2E_SERVE_EXIT_IF_UP'] === '1') return;
    await new Promise(() => undefined);
    return;
  }

  if (!existsSync(join(ROOT, 'apps/server/dist/main.js')) || !existsSync(join(ROOT, 'apps/shell/dist'))) {
    throw new Error('e2e-serve: build outputs missing; run builds (or rely on Nx dependsOn / remote cache) before starting.');
  }

  mkdirSync(OUT, { recursive: true });
  rmSync(TOTP_FILE, { force: true });
  rmSync(TOTP_USED_FILE, { force: true });
  rmSync(BACKUP_ROOT, { recursive: true, force: true });
  rmSync(READY_FILE, { force: true });
  writeFileSync(KEY_FILE, randomBytes(32).toString('base64'), { mode: 0o600 });
  await recreateDatabase();
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
    FORGA_PUBLIC_URL: URL,
    FORGA_MAIL_TRANSPORT: 'memory',
    FORGA_DIGEST_SCHEDULER: 'off',
    FORGA_RETENTION_SCHEDULER: 'off',
    FORGA_STATUS_SCHEDULER: 'off',
    FORGA_PRIVACY_SCHEDULER: 'off',
    FORGA_BACKUP_SCHEDULER: 'off',
    FORGA_MAINTENANCE_FILE: join(OUT, 'maintenance'),
    FORGA_BACKUP_ROOT: BACKUP_ROOT,
    FORGA_IMPORT_URL_ALLOW_PRIVATE: 'true',
  });

  const stop = () => {
    if (server.exitCode === null) {
      try {
        if (KEEP_SERVER && server.pid) process.kill(-server.pid, 'SIGTERM');
        else server.kill('SIGTERM');
      } catch {
        server.kill('SIGTERM');
      }
    }
    rmSync(web, { recursive: true, force: true });
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      // CI Atomizer: leave the detached server for the next shard's reuseExistingServer.
      if (!KEEP_SERVER) stop();
      process.exit(0);
    });
  }
  if (!KEEP_SERVER) process.on('exit', stop);

  await waitForServer(server);
  const env = {
    FORGA_URL: URL,
    FORGA_E2E_URL: URL,
    FORGA_TOTP_FILE: TOTP_FILE,
    FORGA_TOTP_USED_FILE: TOTP_USED_FILE,
    TZ: 'Europe/Berlin',
  };
  await run('pnpm', ['run', 'seed'], { ...env, FORGA_SETUP_TOKEN: setupToken });
  writeFileSync(READY_FILE, URL);
  console.log(`e2e-serve: ready at ${URL}`);
  await new Promise(() => undefined);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
