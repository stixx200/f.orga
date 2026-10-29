import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Transform, type TransformCallback, type Writable } from 'node:stream';

/**
 * File format of a backup (`*.forgabackup`), version 1:
 *
 *   "FORGABAK" | u32 header length | header (JSON, plain) | frames
 *
 * A frame carries at most 1 MiB of the payload: u32 (bit 31: last frame, bits 0–30: length) followed by the data, or,
 * when encrypted, by nonce (12 bytes), ciphertext and GCM tag (16 bytes). The additional data of every frame binds the
 * SHA-256 of the header, the frame number and the last-frame flag, so changed, reordered, removed or appended frames
 * are detected. The key comes from the passphrase with scrypt (salt per file, parameters in the header).
 *
 * The payload is a sequence of entries (u16 name length | name | segments of u32 length + data | u32 0), ended by an
 * empty name: `manifest.json` first, then `database.dump`, optionally `plugins.tgz` and `settings.json`, and
 * `checksums.json` (SHA-256 of all other entries) last.
 */
export const MAGIC = Buffer.from('FORGABAK', 'ascii');
export const FORMAT_VERSION = 1;
export const CHUNK_SIZE = 1024 * 1024;
const FINAL = 0x80000000;
const MAX_HEADER = 64 * 1024;
const NONCE = 12;
const TAG = 16;

/** Parameters of scrypt; N = 2^17 needs 128 MiB of memory and takes well under a second. */
export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}
export const DEFAULT_SCRYPT: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };

export interface BackupEncryption extends ScryptParams {
  cipher: 'aes-256-gcm';
  kdf: 'scrypt';
  chunkSize: number;
  salt: string;
  /** HMAC of a fixed text with the key: tells a wrong passphrase apart from a damaged file. */
  keyCheck: string;
}

/** The plain header: enough to list a backup without the passphrase. */
export interface BackupFileHeader {
  format: number;
  app: 'f.orga';
  appVersion: string;
  instance: string;
  instanceId: string;
  createdAt: string;
  trigger: string;
  /** Fingerprint of the passphrase (see `passphraseId`); `null` when not encrypted. */
  passphraseId: string | null;
  encryption: BackupEncryption | null;
}

/** An error with a code for the API, e.g. `backup.wrongPassphrase`. */
export class BackupError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string | null = null,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const corrupt = (detail: string) => new BackupError('backup.corrupt', detail);

function deriveKey(passphrase: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(passphrase.normalize('NFC'), salt, 32, { ...params, maxmem: 256 * params.N * params.r + 16 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

const keyCheck = (key: Buffer) => createHmac('sha256', key).update('forga-backup key check').digest().subarray(0, 16).toString('base64');

/**
 * Fingerprint of a passphrase shown with every backup (e.g. `3F9AC21B`): first 8 hex digits of an HMAC over a scrypt
 * hash, so it reveals nothing usable about the passphrase and is the same for every file.
 */
export async function passphraseId(passphrase: string, params: ScryptParams = DEFAULT_SCRYPT): Promise<string> {
  const hash = await deriveKey(passphrase, Buffer.from('forga-backup passphrase id'), params);
  return createHmac('sha256', hash).update('id').digest('hex').slice(0, 8).toUpperCase();
}

/** Prepares the header and the key of a new backup file. */
export async function newHeader(
  fields: Omit<BackupFileHeader, 'format' | 'app' | 'encryption'>,
  passphrase: string | null,
  params: ScryptParams = DEFAULT_SCRYPT,
): Promise<{ header: BackupFileHeader; key: Buffer | null }> {
  if (!passphrase) return { header: { format: FORMAT_VERSION, app: 'f.orga', ...fields, passphraseId: null, encryption: null }, key: null };
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt, params);
  const encryption: BackupEncryption = { cipher: 'aes-256-gcm', kdf: 'scrypt', chunkSize: CHUNK_SIZE, ...params, salt: salt.toString('base64'), keyCheck: keyCheck(key) };
  return { header: { format: FORMAT_VERSION, app: 'f.orga', ...fields, encryption }, key };
}

/** The bytes in front of the frames: magic, length and header. */
export function encodeHeader(header: BackupFileHeader): Buffer {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  return Buffer.concat([MAGIC, length, json]);
}

function additionalData(headerHash: Buffer, index: bigint, final: boolean): Buffer {
  const data = Buffer.alloc(32 + 8 + 1);
  headerHash.copy(data, 0);
  data.writeBigUInt64BE(index, 32);
  data[40] = final ? 1 : 0;
  return data;
}

/** Splits the payload into frames of 1 MiB and encrypts them (or only frames them without a key). */
export class FrameEncoder extends Transform {
  private pending: Buffer[] = [];
  private pendingLength = 0;
  private index = 0n;
  private readonly headerHash: Buffer;

  constructor(
    header: Buffer,
    private readonly key: Buffer | null,
  ) {
    super();
    this.headerHash = createHash('sha256').update(header).digest();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.pending.push(chunk);
    this.pendingLength += chunk.length;
    while (this.pendingLength >= CHUNK_SIZE) {
      const all = Buffer.concat(this.pending);
      this.frame(all.subarray(0, CHUNK_SIZE), false);
      const rest = all.subarray(CHUNK_SIZE);
      this.pending = rest.length ? [rest] : [];
      this.pendingLength = rest.length;
    }
    callback();
  }

  override _flush(callback: TransformCallback): void {
    this.frame(Buffer.concat(this.pending), true);
    this.pending = [];
    callback();
  }

  private frame(data: Buffer, final: boolean): void {
    const word = Buffer.alloc(4);
    word.writeUInt32BE((data.length | (final ? FINAL : 0)) >>> 0);
    if (!this.key) {
      this.push(Buffer.concat([word, data]));
    } else {
      const nonce = randomBytes(NONCE);
      const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
      cipher.setAAD(additionalData(this.headerHash, this.index, final));
      const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
      this.push(Buffer.concat([word, nonce, encrypted, cipher.getAuthTag()]));
    }
    this.index++;
  }
}

/** Reads exact byte counts from an async stream of buffers. */
export class ByteReader {
  private chunks: Buffer[] = [];
  private length = 0;
  private done = false;
  private readonly iterator: AsyncIterator<unknown>;

  constructor(source: AsyncIterable<unknown>) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  private async fill(count: number): Promise<void> {
    while (this.length < count && !this.done) {
      const next = await this.iterator.next();
      if (next.done) {
        this.done = true;
        break;
      }
      const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value as Uint8Array);
      if (chunk.length) {
        this.chunks.push(chunk);
        this.length += chunk.length;
      }
    }
  }

  /** Exactly `count` bytes, or `null` if the stream ends before. */
  async read(count: number): Promise<Buffer | null> {
    await this.fill(count);
    if (this.length < count) return null;
    const all = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
    const out = all.subarray(0, count);
    const rest = all.subarray(count);
    this.chunks = rest.length ? [rest] : [];
    this.length = rest.length;
    return out;
  }

  async atEnd(): Promise<boolean> {
    await this.fill(1);
    return this.length === 0;
  }

  /** Stops reading the source (e.g. closes the file). */
  async close(): Promise<void> {
    await this.iterator.return?.();
  }
}

/** Reads magic and header; `backup.notABackup` for other files. */
export async function readHeader(reader: ByteReader): Promise<{ header: BackupFileHeader; bytes: Buffer }> {
  const magic = await reader.read(MAGIC.length);
  if (!magic || !magic.equals(MAGIC)) throw new BackupError('backup.notABackup');
  const lengthBytes = await reader.read(4);
  const length = lengthBytes?.readUInt32BE(0) ?? 0;
  if (!lengthBytes || length < 2 || length > MAX_HEADER) throw corrupt('header length');
  const json = await reader.read(length);
  if (!json) throw corrupt('header truncated');
  let header: BackupFileHeader;
  try {
    header = JSON.parse(json.toString('utf8')) as BackupFileHeader;
  } catch {
    throw corrupt('header not readable');
  }
  if (header.format !== FORMAT_VERSION || header.app !== 'f.orga') throw new BackupError('backup.unknownFormat');
  return { header, bytes: Buffer.concat([magic, lengthBytes, json]) };
}

/** The header of a backup file without reading the rest; `null` for other files. */
export async function readFileHeader(path: string): Promise<BackupFileHeader | null> {
  const handle = await open(path, 'r');
  try {
    const start = Buffer.alloc(MAGIC.length + 4);
    const { bytesRead } = await handle.read(start, 0, start.length, 0);
    if (bytesRead < start.length || !start.subarray(0, MAGIC.length).equals(MAGIC)) return null;
    const length = start.readUInt32BE(MAGIC.length);
    if (length < 2 || length > MAX_HEADER) return null;
    const json = Buffer.alloc(length);
    const read = await handle.read(json, 0, length, start.length);
    if (read.bytesRead < length) return null;
    const header = JSON.parse(json.toString('utf8')) as BackupFileHeader;
    return header.app === 'f.orga' ? header : null;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

/**
 * Opens a backup: checks the header and the passphrase and returns the payload as a stream of plain chunks.
 * Damaged or changed frames end the stream with `backup.corrupt`.
 */
export async function openBackup(source: AsyncIterable<unknown>, passphrase: string | null): Promise<{ header: BackupFileHeader; payload: AsyncGenerator<Buffer>; close: () => Promise<void> }> {
  const reader = new ByteReader(source);
  const { header, bytes } = await readHeader(reader);
  let key: Buffer | null = null;
  const encryption = header.encryption;
  if (encryption) {
    if (!passphrase) throw new BackupError('backup.passphraseRequired');
    if (encryption.cipher !== 'aes-256-gcm' || encryption.kdf !== 'scrypt' || encryption.chunkSize > CHUNK_SIZE * 16) throw new BackupError('backup.unknownFormat');
    if (encryption.N > 2 ** 20 || encryption.r > 32 || encryption.p > 16) throw corrupt('scrypt parameters');
    key = await deriveKey(passphrase, Buffer.from(encryption.salt, 'base64'), encryption);
    const expected = Buffer.from(encryption.keyCheck, 'base64');
    const actual = Buffer.from(keyCheck(key), 'base64');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new BackupError('backup.wrongPassphrase');
  }
  const headerHash = createHash('sha256').update(bytes).digest();
  const chunkSize = encryption?.chunkSize ?? CHUNK_SIZE;

  async function* frames(): AsyncGenerator<Buffer> {
    let index = 0n;
    for (;;) {
      const wordBytes = await reader.read(4);
      if (!wordBytes) throw corrupt('file truncated');
      const word = wordBytes.readUInt32BE(0);
      const final = (word & FINAL) !== 0;
      const length = word & ~FINAL;
      if (length > chunkSize) throw corrupt('frame too large');
      let data: Buffer;
      if (key) {
        const nonce = await reader.read(NONCE);
        const encrypted = await reader.read(length);
        const tag = await reader.read(TAG);
        if (!nonce || !encrypted || !tag) throw corrupt('file truncated');
        try {
          const decipher = createDecipheriv('aes-256-gcm', key, nonce);
          decipher.setAAD(additionalData(headerHash, index, final));
          decipher.setAuthTag(tag);
          data = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        } catch {
          throw corrupt(`frame ${index} changed`);
        }
      } else {
        const plain = await reader.read(length);
        if (!plain) throw corrupt('file truncated');
        data = plain;
      }
      if (data.length) yield data;
      index++;
      if (final) {
        if (!(await reader.atEnd())) throw corrupt('data after the end');
        return;
      }
    }
  }
  return { header, payload: frames(), close: () => reader.close() };
}

/** Opens a backup file. */
export function openBackupFile(path: string, passphrase: string | null) {
  return openBackup(createReadStream(path, { highWaterMark: 256 * 1024 }), passphrase);
}

/** Writes payload entries with backpressure into a stream (usually the frame encoder). */
export class PayloadWriter {
  readonly checksums: Record<string, { sha256: string; size: number }> = {};

  constructor(private readonly out: Writable) {}

  private async write(data: Buffer): Promise<void> {
    if (this.out.destroyed) throw this.out.errored ?? new Error('Output closed');
    if (!this.out.write(data)) await once(this.out, 'drain');
  }

  async entry(name: string, source: Buffer | AsyncIterable<unknown>): Promise<void> {
    const nameBytes = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(2);
    head.writeUInt16BE(nameBytes.length);
    await this.write(Buffer.concat([head, nameBytes]));
    const hash = createHash('sha256');
    let size = 0;
    const segment = async (data: Buffer) => {
      if (!data.length) return;
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length);
      hash.update(data);
      size += data.length;
      await this.write(Buffer.concat([length, data]));
    };
    if (Buffer.isBuffer(source)) {
      for (let offset = 0; offset < source.length; offset += CHUNK_SIZE) await segment(source.subarray(offset, offset + CHUNK_SIZE));
    } else {
      for await (const chunk of source) await segment(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    await this.write(Buffer.alloc(4));
    this.checksums[name] = { sha256: hash.digest('hex'), size };
  }

  /** Writes `checksums.json` and the end mark and ends the stream. */
  async finish(): Promise<void> {
    await this.entry('checksums.json', Buffer.from(JSON.stringify(this.checksums), 'utf8'));
    await this.write(Buffer.alloc(2));
    this.out.end();
  }
}

/** Receives the data of one entry. */
export interface EntrySink {
  write(chunk: Buffer): Promise<void> | void;
  end(): Promise<void> | void;
}

/** Collects an entry in memory (manifest, settings, plugins), up to a limit. */
export function bufferSink(limit: number): EntrySink & { data(): Buffer } {
  const chunks: Buffer[] = [];
  let size = 0;
  return {
    write(chunk) {
      size += chunk.length;
      if (size > limit) throw corrupt('entry too large');
      chunks.push(chunk);
    },
    end() {},
    data: () => Buffer.concat(chunks),
  };
}

export const discardSink: EntrySink = { write() {}, end() {} };

/**
 * Reads the payload entries and hands each to a sink; checks the checksums at the end (`backup.corrupt` on a
 * mismatch). Returns the names and sizes of the entries.
 */
export async function readPayload(payload: AsyncIterable<Buffer>, sinkFor: (name: string) => EntrySink | Promise<EntrySink>): Promise<Record<string, { sha256: string; size: number }>> {
  const reader = new ByteReader(payload);
  const computed: Record<string, { sha256: string; size: number }> = {};
  let stored: Record<string, { sha256: string; size: number }> | null = null;
  for (;;) {
    const head = await reader.read(2);
    if (!head) throw corrupt('payload truncated');
    const nameLength = head.readUInt16BE(0);
    if (nameLength === 0) break;
    const nameBytes = await reader.read(nameLength);
    if (!nameBytes) throw corrupt('payload truncated');
    const name = nameBytes.toString('utf8');
    if (computed[name] || stored) throw corrupt(`unexpected entry ${name}`);
    const isChecksums = name === 'checksums.json';
    const checksumsSink = isChecksums ? bufferSink(1024 * 1024) : null;
    const sink = checksumsSink ?? (await sinkFor(name));
    const hash = createHash('sha256');
    let size = 0;
    for (;;) {
      const lengthBytes = await reader.read(4);
      if (!lengthBytes) throw corrupt('payload truncated');
      const length = lengthBytes.readUInt32BE(0);
      if (length === 0) break;
      const data = await reader.read(length);
      if (!data) throw corrupt('payload truncated');
      hash.update(data);
      size += data.length;
      await sink.write(data);
    }
    await sink.end();
    if (checksumsSink) {
      try {
        stored = JSON.parse(checksumsSink.data().toString('utf8')) as Record<string, { sha256: string; size: number }>;
      } catch {
        throw corrupt('checksums not readable');
      }
    } else {
      computed[name] = { sha256: hash.digest('hex'), size };
    }
  }
  if (!(await reader.atEnd())) throw corrupt('data after the payload');
  if (!stored) throw corrupt('checksums missing');
  const names = new Set([...Object.keys(stored), ...Object.keys(computed)]);
  for (const name of names) {
    if (stored[name]?.sha256 !== computed[name]?.sha256 || stored[name]?.size !== computed[name]?.size) throw corrupt(`checksum of ${name}`);
  }
  return computed;
}
