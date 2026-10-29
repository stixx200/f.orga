import { createWriteStream } from 'node:fs';
import { open, rename, rm, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { type BackupFileHeader, encodeHeader, FrameEncoder, PayloadWriter } from './backup-format.js';

/**
 * Writes a backup file: first as `<path>.part`, renamed to `path` only after all entries, the checksums and the sync
 * to disk succeeded. On failure the part file is removed. Returns the size in bytes.
 */
export async function writeBackupFile(path: string, header: BackupFileHeader, key: Buffer | null, fill: (writer: PayloadWriter) => Promise<void>): Promise<number> {
  const part = `${path}.part`;
  const headerBytes = encodeHeader(header);
  try {
    await writeFile(part, headerBytes, { flag: 'wx', mode: 0o600 });
    const payload = new PassThrough({ highWaterMark: 1024 * 1024 });
    const done = pipeline(payload, new FrameEncoder(headerBytes, key), createWriteStream(part, { flags: 'a' }));
    // A failing pipeline (e.g. disk full) must stop the writer, which waits for `drain`.
    done.catch((error: unknown) => payload.destroy(error instanceof Error ? error : new Error(String(error))));
    const writer = new PayloadWriter(payload);
    try {
      await fill(writer);
      await writer.finish();
    } catch (error) {
      payload.destroy(error instanceof Error ? error : new Error(String(error)));
      await done.catch(() => undefined);
      throw error;
    }
    await done;
    const handle = await open(part, 'r+');
    let size: number;
    try {
      await handle.sync();
      size = (await handle.stat()).size;
    } finally {
      await handle.close();
    }
    await rename(part, path);
    return size;
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}
