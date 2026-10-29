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

/**
 * Kinds of objects a dump of f.orga contains: schemas, tables with data, sequences, defaults, constraints and indexes.
 * Anything else (functions, triggers, extensions, roles, event triggers, privileges …) would run code or change rights
 * when restored, and is refused (`backup.dumpForbidden`).
 */
const ALLOWED_KINDS = ['TABLE DATA', 'FK CONSTRAINT', 'SEQUENCE OWNED BY', 'SEQUENCE SET', 'SEQUENCE', 'CONSTRAINT', 'DEFAULT', 'SCHEMA', 'TABLE', 'INDEX', 'COMMENT'];
/** Schemas of core and modules (lower case with `_`) and `public` (migrations table); never system schemas. */
const ALLOWED_SCHEMA = /^(?!pg_)(?!information_schema$)[a-z][a-z0-9_]*$/;

/**
 * Entries of the table of contents (`pg_restore --list`) that a dump of f.orga never contains; an uploaded file with
 * such entries is not restored. Returns the offending lines (at most 20).
 */
export function forbiddenEntries(output: string): string[] {
  const forbidden: string[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim() || line.startsWith(';')) continue;
    const match = /^\d+; \d+ \d+ (.+)$/.exec(line.trim());
    const rest = match?.[1] ?? '';
    const kind = ALLOWED_KINDS.find((k) => rest.startsWith(`${k} `));
    if (!kind) {
      forbidden.push(line.trim());
      continue;
    }
    const schema = rest.slice(kind.length + 1).split(' ')[0];
    // Schemas name themselves in the name column (schema `-`).
    const name = kind === 'SCHEMA' ? rest.slice(kind.length + 1).split(' ')[1] : schema;
    if (!name || !ALLOWED_SCHEMA.test(name)) forbidden.push(line.trim());
    if (forbidden.length >= 20) break;
  }
  return forbidden;
}

/** Number of objects and schemas in the output of `pg_restore --list`. */
export function summarizeList(output: string): { objects: number; schemas: number } {
  const lines = output.split('\n').filter((line) => line.trim() && !line.startsWith(';'));
  const schemas = new Set(lines.map((line) => / SCHEMA - (\S+)/.exec(line)?.[1]).filter(Boolean));
  // The schema `public` is not dumped as an object, but tables in it are.
  const inSchemas = new Set(lines.map((line) => /^\d+; \d+ \d+ \S+ (\S+) /.exec(line)?.[1]).filter((s) => s && s !== '-'));
  return { objects: lines.length, schemas: new Set([...schemas, ...inSchemas]).size };
}
