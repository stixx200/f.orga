import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { BackupError, bufferSink, CHUNK_SIZE, newHeader, openBackupFile, passphraseId, readFileHeader, readPayload, type ScryptParams } from './backup-format.js';
import { writeBackupFile } from './backup-file.js';

// Small scrypt parameters keep the tests fast; the format stores them in the header.
const FAST: ScryptParams = { N: 2 ** 12, r: 8, p: 1 };
const PASSPHRASE = 'richtig-lange-passphrase';
const fields = { appVersion: '0.1.0', instance: 'test', instanceId: 'abc', createdAt: '2026-10-28T02:30:00.000Z', trigger: 'manual', passphraseId: 'ABCD1234' };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'forga-backup-format-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A dump larger than two frames, streamed in pieces like `pg_dump` output. */
const dump = randomBytes(2 * CHUNK_SIZE + 12345);

async function write(name: string, passphrase: string | null) {
  const path = join(dir, name);
  const { header, key } = await newHeader(fields, passphrase, FAST);
  const size = await writeBackupFile(path, header, key, async (writer) => {
    await writer.entry('manifest.json', Buffer.from(JSON.stringify({ format: 1 })));
    await writer.entry('database.dump', Readable.from([dump.subarray(0, 70_000), dump.subarray(70_000)]));
    await writer.entry('settings.json', Buffer.from('{}'));
  });
  return { path, size };
}

async function read(path: string, passphrase: string | null) {
  const { header, payload } = await openBackupFile(path, passphrase);
  const sinks: Record<string, ReturnType<typeof bufferSink>> = {};
  const entries = await readPayload(payload, (name) => (sinks[name] = bufferSink(10 * CHUNK_SIZE)));
  return { header, entries, data: (name: string) => sinks[name].data() };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'none';
  } catch (error) {
    return error instanceof BackupError ? error.code : String(error);
  }
}

describe('backup file format', () => {
  it('round-trips an encrypted backup', async () => {
    const { path, size } = await write('a.forgabackup', PASSPHRASE);
    expect(size).toBeGreaterThan(dump.length);
    const result = await read(path, PASSPHRASE);
    expect(result.header.encryption?.cipher).toBe('aes-256-gcm');
    expect(Object.keys(result.entries)).toEqual(['manifest.json', 'database.dump', 'settings.json']);
    expect(result.data('database.dump').equals(dump)).toBe(true);
    // The dump is not readable in the file.
    expect(readFileSync(path).includes(dump.subarray(0, 64))).toBe(false);
    expect((await readFileHeader(path))?.instance).toBe('test');
  });

  it('round-trips an unencrypted backup', async () => {
    const { path } = await write('b.forgabackup', null);
    const result = await read(path, null);
    expect(result.header.encryption).toBeNull();
    expect(result.data('database.dump').equals(dump)).toBe(true);
  });

  it('refuses a wrong or missing passphrase', async () => {
    const { path } = await write('c.forgabackup', PASSPHRASE);
    expect(await code(read(path, 'falsche-passphrase-123'))).toBe('backup.wrongPassphrase');
    expect(await code(read(path, null))).toBe('backup.passphraseRequired');
  });

  it('detects changed, truncated and extended files', async () => {
    const { path } = await write('d.forgabackup', PASSPHRASE);
    const original = readFileSync(path);

    const flipped = Buffer.from(original);
    flipped[Math.floor(flipped.length / 2)] ^= 0x01;
    writeFileSync(path, flipped);
    expect(await code(read(path, PASSPHRASE))).toBe('backup.corrupt');

    writeFileSync(path, original.subarray(0, original.length - 100));
    expect(await code(read(path, PASSPHRASE))).toBe('backup.corrupt');

    writeFileSync(path, Buffer.concat([original, Buffer.from('more')]));
    expect(await code(read(path, PASSPHRASE))).toBe('backup.corrupt');

    // The header is bound to every frame: changing the instance in the plain header breaks the file.
    writeFileSync(path, Buffer.from(original.toString('latin1').replace('"instance":"test"', '"instance":"tost"'), 'latin1'));
    expect(await code(read(path, PASSPHRASE))).toBe('backup.corrupt');

    writeFileSync(path, original);
    expect((await read(path, PASSPHRASE)).data('database.dump').equals(dump)).toBe(true);
  });

  it('detects a changed unencrypted file by the checksums', async () => {
    const { path } = await write('e.forgabackup', null);
    const changed = readFileSync(path);
    changed[changed.length - 2 * 1024] ^= 0x01;
    writeFileSync(path, changed);
    expect(await code(read(path, null))).toBe('backup.corrupt');
  });

  it('refuses other files', async () => {
    const path = join(dir, 'other.forgabackup');
    writeFileSync(path, 'PGDMP not a backup');
    expect(await readFileHeader(path)).toBeNull();
    expect(await code(read(path, null))).toBe('backup.notABackup');
  });

  it('gives every passphrase a stable fingerprint', async () => {
    const id = await passphraseId(PASSPHRASE, FAST);
    expect(id).toMatch(/^[0-9A-F]{8}$/);
    expect(await passphraseId(PASSPHRASE, FAST)).toBe(id);
    expect(await passphraseId('eine-andere-passphrase', FAST)).not.toBe(id);
  });
});
