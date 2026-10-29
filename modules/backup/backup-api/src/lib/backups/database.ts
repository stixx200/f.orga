import { once } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { BackupCounts } from '@forga/backup-contracts';
import type { EntrySink } from '../format/backup-format.js';

/** Tables whose rows are counted to compare a backup with the current state. */
const COUNTED: Record<keyof BackupCounts, string> = {
  persons: 'masterdata.person',
  incidents: 'incidents.incident',
  reports: 'incidents.report',
  sessions: 'training.session',
};

/**
 * One query returning the counts as JSON; tables of modules that are not installed count as `null`. `query_to_xml`
 * runs the count only when the table exists, so the statement works in every database.
 */
export const COUNT_SQL = `select json_build_object(${Object.entries(COUNTED)
  .map(([key, table]) => `'${key}', case when to_regclass('${table}') is not null then (xpath('/row/c/text()', query_to_xml('select count(*) as c from ${table}', false, true, '')))[1]::text::bigint end`)
  .join(', ')})::text as counts`;

export function parseCounts(json: string | undefined | null): BackupCounts {
  const parsed = JSON.parse(json || '{}') as Partial<Record<keyof BackupCounts, number | null>>;
  return {
    persons: parsed.persons ?? null,
    incidents: parsed.incidents ?? null,
    reports: parsed.reports ?? null,
    sessions: parsed.sessions ?? null,
  };
}

/** Database names created by the module: `<db>_<kind>_<yyyymmdd_hhmmss>`. */
export function stampedDatabase(database: string, kind: 'restore' | 'before' | 'restoretest', at = new Date()): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  return `${database}_${kind}_${stamp}`.slice(0, 63);
}

/** When a database named by `stampedDatabase` was created; `null` for other names. */
export function stampOf(name: string, database: string, kind: 'restore' | 'before' | 'restoretest'): Date | null {
  const match = new RegExp(`^${database.replace(/[^a-zA-Z0-9_]/g, '\\$&')}_${kind}_(\\d{4})(\\d{2})(\\d{2})_(\\d{2})(\\d{2})(\\d{2})$`).exec(name);
  return match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6])) : null;
}

/**
 * Writes an entry into the standard input of a tool. With `tolerateEarlyExit` (e.g. `pg_restore --list`, which stops
 * after the table of contents) the rest is dropped once the tool has ended; otherwise that is an error.
 */
export function stdinSink(child: ChildProcessWithoutNullStreams, tolerateEarlyExit = false): EntrySink {
  let closed = false;
  child.stdin.on('error', () => (closed = true));
  child.once('close', () => (closed = true));
  return {
    async write(chunk) {
      if (closed || child.stdin.destroyed) {
        if (tolerateEarlyExit) return;
        throw new Error('The tool ended before reading all data');
      }
      if (!child.stdin.write(chunk)) await Promise.race([once(child.stdin, 'drain'), once(child, 'close')]);
    },
    end() {
      if (!closed && !child.stdin.destroyed) child.stdin.end();
    },
  };
}

/** Number of objects and schemas in the output of `pg_restore --list`. */
export function summarizeList(output: string): { objects: number; schemas: number } {
  const lines = output.split('\n').filter((line) => line.trim() && !line.startsWith(';'));
  const schemas = new Set(lines.map((line) => / SCHEMA - (\S+)/.exec(line)?.[1]).filter(Boolean));
  // The schema `public` is not dumped as an object, but tables in it are.
  const inSchemas = new Set(lines.map((line) => /^\d+; \d+ \d+ \S+ (\S+) /.exec(line)?.[1]).filter((s) => s && s !== '-'));
  return { objects: lines.length, schemas: new Set([...schemas, ...inSchemas]).size };
}
