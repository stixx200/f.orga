import { createHash, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { PackageError, readTarGz, writeTarGz } from './tar.js';

/** Description file at the root of a plugin package; the signature covers exactly its bytes. */
export const PLUGIN_FILE = 'forga-plugin.json';
export const SIGNATURE_FILE = 'forga-plugin.sig';

export const PluginInfo = z.object({
  formatVersion: z.literal(1),
  /** Module ID, also the folder name in the plugin directory and the URL prefix. */
  id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  version: z.string().min(1).max(40),
  /** ESM entry of the backend; its default export is the module (`defineModule`). */
  backend: z.string().min(1),
  /** Folder of the frontend build (`remoteEntry.js`), if any. */
  frontend: z.string().min(1).nullable().default(null),
  /** SHA-256 (hex) of every other file in the package. */
  files: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
});
export type PluginInfo = z.infer<typeof PluginInfo>;

export interface VerifiedPlugin {
  info: PluginInfo;
  /** Fingerprint of the key that signed it; `null` = unsigned (only allowed in development). */
  signer: string | null;
  files: Map<string, Buffer>;
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/** Short fingerprint of a public key: first 16 hex digits of the SHA-256 of its DER form. */
export const fingerprint = (key: KeyObject) => sha256(key.export({ type: 'spki', format: 'der' })).slice(0, 16);

/** Ed25519 public keys from base64 DER (SPKI) or PEM, e.g. from `FORGA_PLUGIN_KEYS` (comma separated). */
export function parseKeys(values: string[]): KeyObject[] {
  return values
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => (v.includes('BEGIN') ? createPublicKey(v) : createPublicKey({ key: Buffer.from(v, 'base64'), format: 'der', type: 'spki' })));
}

/**
 * Checks a package's files: description, hashes of all files (none missing, none extra) and the signature by one of
 * the trusted keys. Without a signature the package is refused unless `allowUnsigned`.
 */
export function verifyFiles(files: Map<string, Buffer>, trusted: KeyObject[], allowUnsigned: boolean): VerifiedPlugin {
  const raw = files.get(PLUGIN_FILE);
  if (!raw) throw new PackageError('plugins.descriptionMissing');
  let info: PluginInfo;
  try {
    info = PluginInfo.parse(JSON.parse(raw.toString('utf8')));
  } catch {
    throw new PackageError('plugins.descriptionInvalid');
  }
  const listed = new Set(Object.keys(info.files));
  for (const path of files.keys()) {
    if (path === PLUGIN_FILE || path === SIGNATURE_FILE) continue;
    if (!listed.has(path)) throw new PackageError('plugins.unlistedFile');
  }
  for (const [path, hash] of Object.entries(info.files)) {
    const content = files.get(path);
    if (!content || sha256(content) !== hash) throw new PackageError('plugins.hashMismatch');
  }
  if (!info.files[info.backend]) throw new PackageError('plugins.backendMissing');
  if (info.frontend && !info.files[`${info.frontend}/remoteEntry.js`]) throw new PackageError('plugins.frontendMissing');

  const signature = files.get(SIGNATURE_FILE);
  if (!signature) {
    if (!allowUnsigned) throw new PackageError('plugins.unsigned');
    return { info, signer: null, files };
  }
  const bytes = Buffer.from(signature.toString('utf8').trim(), 'base64');
  const key = trusted.find((k) => verify(null, raw, k, bytes));
  if (!key) throw new PackageError('plugins.untrustedSignature');
  return { info, signer: fingerprint(key), files };
}

export function verifyPackage(archive: Buffer, trusted: KeyObject[], allowUnsigned: boolean): VerifiedPlugin {
  return verifyFiles(readTarGz(archive), trusted, allowUnsigned);
}

/**
 * Builds a package from files (paths relative to the package root): writes the description with the hashes and,
 * with a private key, the signature. Used by `tools/plugin.mts` and the tests.
 */
export function buildPackage(content: Map<string, Buffer>, description: Omit<PluginInfo, 'files' | 'formatVersion'>, privateKey?: KeyObject): Buffer {
  const files = new Map(content);
  const info: PluginInfo = { formatVersion: 1, ...description, files: Object.fromEntries([...files].map(([path, data]) => [path, sha256(data)])) };
  const raw = Buffer.from(`${JSON.stringify(info, null, 2)}\n`);
  files.set(PLUGIN_FILE, raw);
  if (privateKey) files.set(SIGNATURE_FILE, Buffer.from(sign(null, raw, privateKey).toString('base64')));
  return writeTarGz(files);
}
