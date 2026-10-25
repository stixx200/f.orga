import { gunzipSync, gzipSync } from 'node:zlib';

const BLOCK = 512;

/** Limits for packages: unpacked size and number of files. */
export const MAX_UNPACKED = 50 * 1024 * 1024;
export const MAX_FILES = 2000;

export class PackageError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const text = (block: Buffer, offset: number, length: number) => {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end < 0 ? raw.length : end).toString('utf8');
};
const octal = (block: Buffer, offset: number, length: number) => Number.parseInt(text(block, offset, length).trim() || '0', 8);

/** A relative path inside the package: no absolute paths, no `..`, no backslashes. */
export function safePath(name: string): string {
  const path = name.replace(/^\.\//, '').replace(/\/$/, '');
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some((p) => p === '..' || p === '.' || p === '')) throw new PackageError('plugins.badPath');
  return path;
}

/**
 * Reads a gzipped tar (ustar) with regular files and directories only; links and devices are refused, PAX headers ignored.
 * Returns the files by path.
 */
export function readTarGz(archive: Buffer): Map<string, Buffer> {
  let data: Buffer;
  try {
    data = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED + 1024 * 1024 });
  } catch {
    throw new PackageError('plugins.notAPackage');
  }
  const files = new Map<string, Buffer>();
  let total = 0;
  for (let offset = 0; offset + BLOCK <= data.length; ) {
    const header = data.subarray(offset, offset + BLOCK);
    if (header.every((b) => b === 0)) break;
    const stored = octal(header, 148, 8);
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
    if (sum !== stored) throw new PackageError('plugins.notAPackage');
    const prefix = text(header, 345, 155);
    const name = prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100);
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    offset += BLOCK;
    if (type === '5') {
      safePath(name);
    } else if (type === 'x' || type === 'g') {
      // PAX headers (e.g. from macOS tar) carry extended attributes; only the checked ustar name is used.
    } else if (type === '0') {
      const path = safePath(name);
      total += size;
      if (total > MAX_UNPACKED || files.size >= MAX_FILES) throw new PackageError('plugins.tooLarge');
      if (offset + size > data.length) throw new PackageError('plugins.notAPackage');
      if (files.has(path)) throw new PackageError('plugins.duplicateFile');
      // Metadata files of macOS (`._name`, `.DS_Store`) are dropped.
      const base = path.slice(path.lastIndexOf('/') + 1);
      if (!base.startsWith('._') && base !== '.DS_Store') files.set(path, Buffer.from(data.subarray(offset, offset + size)));
    } else {
      throw new PackageError('plugins.unsupportedEntry');
    }
    offset += Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
}

function fileHeader(path: string, size: number): Buffer {
  const block = Buffer.alloc(BLOCK);
  let name = path;
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const cut = path.lastIndexOf('/', 155);
    if (cut <= 0 || Buffer.byteLength(path.slice(cut + 1)) > 100) throw new PackageError('plugins.badPath');
    prefix = path.slice(0, cut);
    name = path.slice(cut + 1);
  }
  block.write(name, 0, 100, 'utf8');
  block.write('0000644\0', 100);
  block.write('0000000\0', 108);
  block.write('0000000\0', 116);
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  block.write('00000000000\0', 136);
  block.write('        ', 148);
  block.write('0', 156);
  block.write('ustar\0', 257);
  block.write('00', 263);
  block.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of block) sum += b;
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return block;
}

/** Writes regular files as gzipped ustar, sorted by path (reproducible). */
export function writeTarGz(files: ReadonlyMap<string, Buffer>): Buffer {
  const parts: Buffer[] = [];
  for (const path of [...files.keys()].toSorted()) {
    const content = files.get(path)!;
    parts.push(fileHeader(safePath(path), content.length), content, Buffer.alloc((BLOCK - (content.length % BLOCK)) % BLOCK));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return gzipSync(Buffer.concat(parts));
}
