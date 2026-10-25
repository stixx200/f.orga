import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Logger } from '@nestjs/common';
import type { KeyObject } from 'node:crypto';
import type { ForgaModule } from '../module/forga-module.js';
import { parseKeys, type VerifiedPlugin, verifyFiles, verifyPackage } from './plugin-package.js';
import { MAX_FILES, MAX_UNPACKED, PackageError } from './tar.js';

const logger = new Logger('Plugins');

/** Where plugins live and whom to trust; from the environment. */
export interface PluginConfig {
  /** Plugin directory (`FORGA_PLUGIN_DIR`, e.g. the volume `/plugins`); `null` = plugins off. */
  dir: string | null;
  /** Trusted Ed25519 keys: `FORGA_PLUGIN_KEYS` (comma separated) and the file `trusted-keys` in the directory (one per line). */
  trusted: KeyObject[];
  /** Accept unsigned packages (`FORGA_PLUGINS_ALLOW_UNSIGNED=true`, development only). */
  allowUnsigned: boolean;
}

export interface PluginState {
  id: string;
  version: string;
  signer: string | null;
  /** `loaded`: running; `installed`: takes effect after a restart; `removed`: gone after a restart; `error`: not loaded. */
  status: 'loaded' | 'installed' | 'removed' | 'error';
  error: string | null;
  /** Folder with the frontend build, served at `/modules/<id>/`. */
  frontendDir: string | null;
}

export function pluginConfig(env: NodeJS.ProcessEnv = process.env): PluginConfig {
  const dir = env['FORGA_PLUGIN_DIR'] || null;
  const keys = (env['FORGA_PLUGIN_KEYS'] ?? '').split(',');
  if (dir && existsSync(join(dir, 'trusted-keys'))) keys.push(...readFileSync(join(dir, 'trusted-keys'), 'utf8').split('\n').filter((l) => !l.startsWith('#')));
  return { dir, trusted: parseKeys(keys), allowUnsigned: env['FORGA_PLUGINS_ALLOW_UNSIGNED'] === 'true' };
}

/** All files below a folder, with the same limits as for packages. */
function readTree(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let total = 0;
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        total += statSync(path).size;
        if (total > MAX_UNPACKED || files.size >= MAX_FILES) throw new PackageError('plugins.tooLarge');
        files.set(relative(root, path).split('\\').join('/'), readFileSync(path));
      } else throw new PackageError('plugins.unsupportedEntry');
    }
  };
  walk(root);
  return files;
}

/** Checks a package and writes it to `<dir>/<id>`, replacing an older version. Built-in modules cannot be replaced. */
export function installPackage(config: PluginConfig, archive: Buffer, builtIn: ReadonlySet<string>): VerifiedPlugin {
  if (!config.dir) throw new PackageError('plugins.disabled');
  const plugin = verifyPackage(archive, config.trusted, config.allowUnsigned);
  if (builtIn.has(plugin.info.id)) throw new PackageError('plugins.builtInModule');
  const staging = join(config.dir, `.staging-${plugin.info.id}`);
  rmSync(staging, { recursive: true, force: true });
  for (const [path, content] of plugin.files) {
    const target = join(staging, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const target = join(config.dir, plugin.info.id);
  rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
  return plugin;
}

export function removePlugin(config: PluginConfig, id: string): boolean {
  if (!config.dir || !/^[a-z][a-z0-9-]*$/.test(id) || !existsSync(join(config.dir, id))) return false;
  rmSync(join(config.dir, id), { recursive: true, force: true });
  return true;
}

let hooked = false;

/**
 * Bare imports of plugin code (`@nestjs/common`, `@forga/core-api`, …) resolve as if imported by the server itself,
 * so plugins share the server's instances (dependency injection, entities) instead of bringing their own copies.
 */
function shareHostPackages(dir: string): void {
  if (hooked) return;
  hooked = true;
  const pluginRoot = pathToFileURL(`${dir}/`).href;
  const host = pathToFileURL(process.argv[1] ?? join(process.cwd(), 'index.js')).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const bare = !/^(\.{0,2}\/|[a-z]+:)/i.test(specifier);
      if (bare && context.parentURL?.startsWith(pluginRoot)) return nextResolve(specifier, { ...context, parentURL: host });
      return nextResolve(specifier, context);
    },
  });
}

const isModule = (value: unknown): value is ForgaModule =>
  typeof value === 'object' && value !== null && 'manifest' in value && 'migrations' in value && typeof (value as ForgaModule).manifest?.id === 'string';

/**
 * Loads the plugins at startup: installs packages dropped into the directory (`*.tgz`), checks every installed
 * plugin again (hashes, signature) and imports its backend. A broken plugin is reported, the server still starts.
 */
export async function loadPlugins(
  config: PluginConfig,
  builtIn: ReadonlySet<string>,
  importModule: (url: string) => Promise<{ default?: unknown }>,
): Promise<{ modules: ForgaModule[]; states: PluginState[] }> {
  const modules: ForgaModule[] = [];
  const states: PluginState[] = [];
  if (!config.dir || !existsSync(config.dir)) return { modules, states };
  shareHostPackages(config.dir);

  for (const name of readdirSync(config.dir).filter((n) => n.endsWith('.tgz'))) {
    const path = join(config.dir, name);
    try {
      const plugin = installPackage(config, readFileSync(path), builtIn);
      renameSync(path, `${path}.installed`);
      logger.log(`Installed plugin ${plugin.info.id} ${plugin.info.version} from ${name}`);
    } catch (error) {
      renameSync(path, `${path}.rejected`);
      logger.error(`Plugin package ${name} rejected: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const entry of readdirSync(config.dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const root = join(config.dir, entry.name);
    const state: PluginState = { id: entry.name, version: '', signer: null, status: 'error', error: null, frontendDir: null };
    states.push(state);
    try {
      const plugin = verifyFiles(readTree(root), config.trusted, config.allowUnsigned);
      Object.assign(state, { version: plugin.info.version, signer: plugin.signer });
      if (plugin.info.id !== entry.name || builtIn.has(plugin.info.id)) throw new PackageError('plugins.descriptionInvalid');
      const loaded = (await importModule(pathToFileURL(join(root, plugin.info.backend)).href)).default;
      if (!isModule(loaded) || loaded.manifest.id !== plugin.info.id) throw new PackageError('plugins.notAModule');
      modules.push(loaded);
      Object.assign(state, { status: 'loaded', frontendDir: plugin.info.frontend ? join(root, plugin.info.frontend) : null });
      logger.log(`Loaded plugin ${plugin.info.id} ${plugin.info.version}${plugin.signer ? ` (signed by ${plugin.signer})` : ' (unsigned)'}`);
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      logger.error(`Plugin ${entry.name} not loaded: ${state.error}`);
    }
  }
  return { modules, states };
}
