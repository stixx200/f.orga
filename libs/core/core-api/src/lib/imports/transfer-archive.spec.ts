import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strToU8, zipSync } from 'fflate';
import { TransferArchive, TransferError } from './transfer-archive.js';

const INFO = strToU8('[content]\r\ntype=transfer\r\nencrypted=0\r\n');
const limits = { perArchive: 1024 * 1024, total: 1536 * 1024 };

function database(): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'forga-transfer-spec-'));
  try {
    const db = new DatabaseSync(join(dir, 'transfer.db'));
    db.exec(`create table PER_STAMM (PER_ID TEXT); insert into PER_STAMM values ('P1')`);
    db.close();
    return readFileSync(join(dir, 'transfer.db'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const open = (files: { name: string; data: Uint8Array }[]) =>
  TransferArchive.openAll(files, (archives) => archives.map((a) => [a.label, a.query('select * from PER_STAMM').length]), limits);

const failure = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => (error instanceof TransferError ? error.code : String(error)));

describe('TransferArchive.openAll', () => {
  it('reads the database of a transfer archive', async () => {
    const zip = zipSync({ 'MPTRA.IFO': INFO, 'transfer.db': database() });
    expect(await open([{ name: 'MPTRA_01_2026-10-25-074935_Abt._Musterstadt.zip', data: zip }])).toEqual([['Abt. Musterstadt', 1]]);
  });

  it('stops unpacking a database larger than the limit (zip bomb)', async () => {
    // 2 MB of zeros compress to a few kB.
    const bomb = zipSync({ 'MPTRA.IFO': INFO, 'transfer.db': new Uint8Array(2 * 1024 * 1024) }, { level: 9 });
    expect(bomb.length).toBeLessThan(20_000);
    expect(await failure(open([{ name: 'bomb.zip', data: bomb }]))).toBe('imports.transferTooLarge');
  });

  it('limits the unpacked size of all archives together', async () => {
    const part = zipSync({ 'MPTRA.IFO': INFO, 'transfer.db': new Uint8Array(900 * 1024) });
    expect(await failure(open([{ name: 'a.zip', data: part }, { name: 'b.zip', data: part }]))).toBe('imports.transferTooLarge');
  });

  it('rejects other files', async () => {
    expect(await failure(open([{ name: 'x.zip', data: strToU8('kein zip') }]))).toBe('imports.transferUnreadable');
    expect(await failure(open([{ name: 'x.zip', data: zipSync({ 'transfer.db': database() }) }]))).toBe('imports.transferUnreadable');
  });
});
