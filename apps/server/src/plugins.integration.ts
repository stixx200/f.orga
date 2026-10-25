import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPackage, fingerprint, loadPlugins, pluginConfig, type PluginState } from '@forga/core-api';
import { INSTALLED_MODULES } from './app/installed-modules';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/** A plugin as a bundler would produce it: one ESM file importing the server's packages. */
const BACKEND = `
import { Controller, Get, Module } from '@nestjs/common';
import { defineModule, RequirePermissions, SettingsService } from '@forga/core-api';

class PingController {
  constructor(settings) { this.settings = settings; }
  async ping() { return { pong: true, brigade: (await this.settings.get('brigade'))?.name ?? null }; }
}
Reflect.defineMetadata('design:paramtypes', [SettingsService], PingController);
const ping = Object.getOwnPropertyDescriptor(PingController.prototype, 'ping');
Get('ping')(PingController.prototype, 'ping', ping);
RequirePermissions('hello-world.read')(PingController.prototype, 'ping', ping);
Controller('hello-world')(PingController);

class HelloWorldModule {}
Module({ controllers: [PingController] })(HelloWorldModule);

export default defineModule({
  manifest: {
    id: 'hello-world',
    name: { de: 'Hallo Welt', en: 'Hello world' },
    version: '1.0.0',
    requires: ['masterdata'],
    permissions: [{ id: 'hello-world.read', name: { de: 'Hallo lesen', en: 'Read hello' }, scope: 'brigade' }],
    frontend: { remote: 'hello_world', exposed: './Module' },
  },
  nestModule: HelloWorldModule,
});
`;

const files = (version = '1.0.0') =>
  new Map([
    ['backend/index.js', Buffer.from(BACKEND.replace("version: '1.0.0'", `version: '${version}'`))],
    ['frontend/remoteEntry.js', Buffer.from('export const hello = "world";\n')],
  ]);
const description = (version = '1.0.0', id = 'hello-world') => ({ id, version, backend: 'backend/index.js', frontend: 'frontend' });

// Inside the repository, so plugin imports find node_modules also under the test runner.
const dir = join(process.cwd(), 'dist', 'test-plugins', randomUUID());
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
let test: TestApp;
let admin: string;
let states: PluginState[];

const upload = (archive: Buffer) => test.http.post('/api/core/plugins').set('Cookie', admin).set(UI).attach('file', archive, 'plugin.tgz');

beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'trusted-keys'), `# test key\n${publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}\n`);
  // Dropped into the volume: installed and loaded at startup.
  writeFileSync(join(dir, 'hello-world.tgz'), buildPackage(files(), description(), privateKey));
  const config = pluginConfig({ FORGA_PLUGIN_DIR: dir });
  const loaded = await loadPlugins(config, new Set(INSTALLED_MODULES.map((m) => m.manifest.id)), (url) => import(url));
  states = loaded.states;
  test = await startTestApp({ modules: [...INSTALLED_MODULES, ...loaded.modules], plugins: { config, states } });
  admin = await setUp(test);
});

afterAll(async () => {
  await test?.app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('plugins', () => {
  it('installs a dropped package and loads it like a built-in module', async () => {
    expect(states).toEqual([expect.objectContaining({ id: 'hello-world', version: '1.0.0', status: 'loaded', signer: fingerprint(publicKey) })]);
    expect(existsSync(join(dir, 'hello-world.tgz.installed'))).toBe(true);

    const modules = (await test.http.get('/api/core/modules').set('Cookie', admin).expect(200)).body as { id: string; frontend: { entry: string } | null }[];
    expect(modules.find((m) => m.id === 'hello-world')?.frontend?.entry).toBe('/modules/hello-world/remoteEntry.js');
    // The plugin uses the server's services (dependency injection across the package boundary).
    expect((await test.http.get('/api/hello-world/ping').set('Cookie', admin).expect(200)).body).toEqual({ pong: true, brigade: 'Feuerwehr Musterstadt' });
    expect((await test.http.get('/modules/hello-world/remoteEntry.js').expect(200)).text).toContain('hello');
  });

  it('lists plugins with signer and trusted keys', async () => {
    const list = (await test.http.get('/api/core/plugins').set('Cookie', admin).expect(200)).body;
    expect(list).toMatchObject({ enabled: true, allowUnsigned: false, trustedKeys: [fingerprint(publicKey)], plugins: [{ id: 'hello-world', status: 'loaded' }] });
  });

  it('refuses unsigned, foreign, changed and built-in packages', async () => {
    expect((await upload(buildPackage(files(), description('2.0.0'))).expect(400)).body.code).toBe('plugins.unsigned');
    expect((await upload(buildPackage(files(), description('2.0.0'), generateKeyPairSync('ed25519').privateKey)).expect(400)).body.code).toBe('plugins.untrustedSignature');
    expect((await upload(buildPackage(files(), description('2.0.0', 'masterdata'), privateKey)).expect(400)).body.code).toBe('plugins.builtInModule');
    expect((await upload(Buffer.from('not a package')).expect(400)).body.code).toBe('plugins.notAPackage');
  });

  it('installs an update for the next start and removes plugins', async () => {
    const result = (await upload(buildPackage(files('2.0.0'), description('2.0.0'), privateKey)).expect(201)).body;
    expect(result).toEqual({ id: 'hello-world', version: '2.0.0', signer: fingerprint(publicKey), restartRequired: true });
    expect((await test.http.get('/api/core/plugins').set('Cookie', admin).expect(200)).body.plugins).toEqual([expect.objectContaining({ version: '2.0.0', status: 'installed' })]);

    await test.http.delete('/api/core/plugins/hello-world').set('Cookie', admin).set(UI).expect(204);
    expect(existsSync(join(dir, 'hello-world'))).toBe(false);
    expect((await test.http.get('/api/core/plugins').set('Cookie', admin).expect(200)).body.plugins[0].status).toBe('removed');
  });
});
