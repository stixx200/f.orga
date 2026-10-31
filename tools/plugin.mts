/**
 * Plugin packages for f.orga.
 *
 *   pnpm run plugin -- keygen <name>                 Ed25519 key pair: <name>.key.pem (keep secret) and the public key
 *                                                   to put into FORGA_PLUGIN_KEYS or <plugin dir>/trusted-keys
 *   pnpm run plugin -- pack <folder> --key <file>    signed package <id>-<version>.tgz from <folder>
 *
 * <folder> contains `plugin.json` ({ id, version, backend, frontend }) and the built files, e.g.
 * `backend/index.js` (ESM, default export from `defineModule`, server packages not bundled) and
 * `frontend/remoteEntry.js` (Module Federation remote built with base `/modules/<id>/`).
 */
import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildPackage, fingerprint } from '@forga/core-api';

const [command, target, ...rest] = process.argv.slice(2);
const option = (name: string) => {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
};

function files(root: string): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name !== 'plugin.json') result.set(relative(root, path).split('\\').join('/'), readFileSync(path));
    }
  };
  walk(root);
  return result;
}

if (command === 'keygen' && target) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(`${target}.key.pem`, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log(`Private key: ${target}.key.pem (keep it secret)`);
  console.log(`Public key (fingerprint ${fingerprint(publicKey)}):`);
  console.log(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
} else if (command === 'pack' && target) {
  const description = JSON.parse(readFileSync(join(target, 'plugin.json'), 'utf8')) as { id: string; version: string; backend: string; frontend?: string | null };
  const keyFile = option('--key');
  const key = keyFile ? createPrivateKey(readFileSync(keyFile)) : undefined;
  if (!key) console.warn('Without --key the package is unsigned and only accepted with FORGA_PLUGINS_ALLOW_UNSIGNED=true.');
  const out = option('--out') ?? `${description.id}-${description.version}.tgz`;
  writeFileSync(out, buildPackage(files(target), { id: description.id, version: description.version, backend: description.backend, frontend: description.frontend ?? null }, key));
  console.log(`Package written: ${out}`);
} else {
  console.error('Usage: pnpm run plugin -- keygen <name> | pack <folder> --key <private key> [--out <file>]');
  process.exit(1);
}
