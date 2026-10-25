import { closeSync, openSync, writeSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { Unzip, UnzipInflate } from 'fflate';

/** MP-Feuer stores "no date" as Delphi's day zero. */
const EMPTY_DATE = /^1899-12-30/;
const MILLISECONDS = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\.\d+$/;

/** Limits for unpacking, so a crafted archive cannot fill memory or disk (zip bomb). */
export interface UnpackLimits {
  /** Unpacked size of one `transfer.db`. */
  perArchive: number;
  /** Unpacked size of all archives of an upload together. */
  total: number;
}

export const UNPACK_LIMITS: UnpackLimits = { perArchive: 500 * 1024 * 1024, total: 2 * 1024 * 1024 * 1024 };
const MAX_INFO = 64 * 1024;

/**
 * Unpacks `MPTRA.IFO` (returned) and `transfer.db` (streamed to `path`) and counts the real bytes while
 * inflating, because the sizes in the zip headers may lie. Returns `null` without `transfer.db`.
 */
function unpack(data: Uint8Array, path: string, maxSize: number, fileName: string): { info: string; size: number } | null {
  let info = '';
  let size = -1;
  const fd = openSync(path, 'w');
  try {
    const unzip = new Unzip((file) => {
      if (file.name === 'MPTRA.IFO') {
        const decoder = new TextDecoder();
        file.ondata = (error, chunk) => {
          if (error) throw error;
          info += decoder.decode(chunk, { stream: true });
          if (info.length > MAX_INFO) throw new TransferError('imports.transferUnreadable', fileName);
        };
        file.start();
      } else if (file.name === 'transfer.db' && size < 0) {
        size = 0;
        file.ondata = (error, chunk) => {
          if (error) throw error;
          size += chunk.length;
          if (size > maxSize) throw new TransferError('imports.transferTooLarge', fileName);
          writeSync(fd, chunk);
        };
        file.start();
      }
    });
    unzip.register(UnzipInflate);
    unzip.push(data, true);
  } catch (error) {
    if (error instanceof TransferError) throw error;
    throw new TransferError('imports.transferUnreadable', fileName);
  } finally {
    closeSync(fd);
  }
  return size < 0 ? null : { info, size };
}

/** Unit from the file name, e.g. `MPTRA_01_2026-10-25-074935_Abt._Musterstadt.zip` → key `01`, label `Abt. Musterstadt`. */
export function transferFileName(fileName: string, index: number): { key: string; label: string } {
  const match = /^MPTRA_(\d+)_[\d-]+_(.+)\.zip$/i.exec(fileName.trim());
  if (!match) return { key: String(index + 1), label: fileName.replace(/\.zip$/i, '') };
  return { key: match[1], label: match[2].replace(/_/g, ' ').replace(/\s+/g, ' ').trim() };
}

/**
 * One MP-Feuer transfer archive (`MPTRA_*.zip` with `MPTRA.IFO` and the SQLite database `transfer.db`).
 * Child tables refer to their parent with `<PREFIX>_INDEX` = parent `<PREFIX>_ID`.
 */
export class TransferArchive {
  private constructor(
    readonly key: string,
    readonly fileName: string,
    readonly label: string,
    private readonly db: DatabaseSync,
  ) {}

  /** Opens the archives, passes them to `read` and removes the extracted databases afterwards. */
  static async openAll<T>(
    files: readonly { name: string; data: Uint8Array }[],
    read: (archives: TransferArchive[]) => T,
    limits: UnpackLimits = UNPACK_LIMITS,
  ): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'forga-transfer-'));
    const archives: TransferArchive[] = [];
    let total = 0;
    try {
      for (const [index, file] of files.entries()) {
        const path = join(dir, `${index}.db`);
        const unpacked = unpack(file.data, path, Math.min(limits.perArchive, limits.total - total), file.name);
        if (!unpacked || !/type=transfer/i.test(unpacked.info)) throw new TransferError('imports.transferUnreadable', file.name);
        if (/encrypted=1/i.test(unpacked.info)) throw new TransferError('imports.transferEncrypted', file.name);
        total += unpacked.size;
        const { key, label } = transferFileName(file.name, index);
        const unique = archives.some((a) => a.key === key) ? `${key}-${index + 1}` : key;
        archives.push(new TransferArchive(unique, file.name, label, new DatabaseSync(path, { readOnly: true })));
      }
      return read(archives);
    } finally {
      for (const archive of archives) archive.db.close();
      await rm(dir, { recursive: true, force: true });
    }
  }

  has(table: string): boolean {
    return !!this.db.prepare(`select 1 from sqlite_master where type = 'table' and name = ?`).get(table);
  }

  /** Rows as text: `null` and empty dates become `''`, flags `1`/`0`, times `JJJJ-MM-TT HH:MM:SS`. */
  query(sql: string, ...params: SQLInputValue[]): Record<string, string>[] {
    return this.db.prepare(sql).all(...params).map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([column, value]) => {
          if (value === null || value === undefined) return [column, ''];
          const text = String(value);
          if (EMPTY_DATE.test(text)) return [column, ''];
          return [column, text.replace(MILLISECONDS, '$1')];
        }),
      ),
    );
  }
}

/** Rows grouped by a column, e.g. child rows by their parent (`EIN_INDEX`). */
export function groupRows(rows: readonly Record<string, string>[], column: string): Map<string, Record<string, string>[]> {
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const group = groups.get(row[column]);
    if (group) group.push(row);
    else groups.set(row[column], [row]);
  }
  return groups;
}

/** An archive that is not an MP-Feuer transfer file or cannot be read. */
export class TransferError extends Error {
  constructor(
    readonly code: string,
    readonly fileName: string,
  ) {
    super(`${code}: ${fileName}`);
  }
}

/** A person of the archives (members `PER_STAMM` and youth `JUG_STAMM`), referenced by the MP-Feuer ID. */
export interface TransferPerson {
  archive: string;
  youth: boolean;
  firstName: string;
  lastName: string;
  birthDate: string;
  /** Archived in MP-Feuer = left the brigade. "Aktiv bis" alone ends the active service, e.g. on moving to the veterans. */
  left: boolean;
  row: Record<string, string>;
}

/** Persons of all archives by MP-Feuer ID (`PER_ID`, `JUG_ID`); IDs are unique across the archives of a brigade. */
export function transferPersons(archives: readonly TransferArchive[]): Map<string, TransferPerson> {
  const persons = new Map<string, TransferPerson>();
  for (const archive of archives) {
    for (const [table, prefix, youth] of [['PER_STAMM', 'PER', false], ['JUG_STAMM', 'JUG', true]] as const) {
      if (!archive.has(table)) continue;
      for (const row of archive.query(`select * from ${table}`)) {
        const firstName = row[`${prefix}_VORNAME`].trim();
        const lastName = row[`${prefix}_NACHNAME`].trim();
        if (!firstName || !lastName) continue;
        persons.set(row[`${prefix}_ID`], {
          archive: archive.key,
          youth,
          firstName,
          lastName,
          birthDate: row[`${prefix}_GEB_DAT`].slice(0, 10),
          left: !!row[`${prefix}_ARCHIV_DAT`],
          row,
        });
      }
    }
  }
  return persons;
}

/** "Nachname Vorname" as in the MP-Feuer lists; profiles match it in any order of the parts. */
export const transferPersonName = (person: Pick<TransferPerson, 'firstName' | 'lastName'>) => `${person.lastName} ${person.firstName}`;

/** `1`/`0` flags as the yes/no text the profiles read. */
export const transferFlag = (value: string | undefined) => (value === '1' || value?.toLowerCase() === 'true' ? 'ja' : '');
