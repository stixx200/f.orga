import { generateKeyPairSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { buildPackage, fingerprint, parseKeys, verifyPackage } from './plugin-package.js';
import { readTarGz, writeTarGz } from './tar.js';

const keys = () => generateKeyPairSync('ed25519');
const content = () =>
  new Map([
    ['backend/index.js', Buffer.from('export default {};\n')],
    ['frontend/remoteEntry.js', Buffer.from('// remote\n')],
  ]);
const description = { id: 'hello-world', version: '1.0.0', backend: 'backend/index.js', frontend: 'frontend' };
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'no error';
};

describe('tar', () => {
  it('writes and reads files, also with long paths', () => {
    const long = `${'a'.repeat(80)}/${'b'.repeat(60)}/file.js`;
    const files = readTarGz(writeTarGz(new Map([['x.txt', Buffer.from('1')], [long, Buffer.from('2')]])));
    expect([...files.keys()]).toEqual([long, 'x.txt']);
    expect(files.get(long)?.toString()).toBe('2');
  });

  it('refuses paths leaving the package and links', () => {
    const tar = gunzipSync(writeTarGz(new Map([['evil.txt', Buffer.from('x')]])));
    const patch = (name: string, type = '0') => {
      const copy = Buffer.from(tar);
      copy.fill(0, 0, 100);
      copy.write(name, 0);
      copy.write(type, 156);
      copy.write('        ', 148);
      let sum = 0;
      for (let i = 0; i < 512; i++) sum += copy[i];
      copy.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
      return gzipSync(copy);
    };
    expect(code(() => readTarGz(patch('../evil.txt')))).toBe('plugins.badPath');
    expect(code(() => readTarGz(patch('/etc/evil')))).toBe('plugins.badPath');
    expect(code(() => readTarGz(patch('link', '2')))).toBe('plugins.unsupportedEntry');
    expect(code(() => readTarGz(Buffer.from('no archive')))).toBe('plugins.notAPackage');
  });
});

describe('plugin packages', () => {
  it('accepts a package signed by a trusted key', () => {
    const { publicKey, privateKey } = keys();
    const plugin = verifyPackage(buildPackage(content(), description, privateKey), [publicKey], false);
    expect(plugin.info).toMatchObject({ id: 'hello-world', version: '1.0.0' });
    expect(plugin.signer).toBe(fingerprint(publicKey));
  });

  it('refuses unsigned, foreign and changed packages', () => {
    const { publicKey, privateKey } = keys();
    expect(code(() => verifyPackage(buildPackage(content(), description), [publicKey], false))).toBe('plugins.unsigned');
    expect(verifyPackage(buildPackage(content(), description), [], true).signer).toBeNull();
    expect(code(() => verifyPackage(buildPackage(content(), description, keys().privateKey), [publicKey], false))).toBe('plugins.untrustedSignature');

    const files = readTarGz(buildPackage(content(), description, privateKey));
    files.set('backend/index.js', Buffer.from('export default { evil: true };'));
    expect(code(() => verifyPackage(writeTarGz(files), [publicKey], false))).toBe('plugins.hashMismatch');
    files.delete('backend/index.js');
    files.set('extra.js', Buffer.from(''));
    expect(code(() => verifyPackage(writeTarGz(files), [publicKey], false))).toBe('plugins.unlistedFile');
  });

  it('reads trusted keys as base64 DER or PEM', () => {
    const { publicKey } = keys();
    const der = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(parseKeys([der, pem, '']).map(fingerprint)).toEqual([fingerprint(publicKey), fingerprint(publicKey)]);
  });
});
