import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { BackupError } from '../format/backup-format.js';

export type PgTool = 'pg_dump' | 'pg_restore' | 'psql';

/** Keeps the end of a tool's error output for messages (at most 4 KiB). */
export class OutputTail {
  private text = '';

  add(chunk: Buffer | string): void {
    this.text = (this.text + chunk.toString()).slice(-4096);
  }

  toString(): string {
    return this.text.trim();
  }
}

/** Quotes a database name for SQL. */
export const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;
export const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Runs the PostgreSQL client tools against the database of the server. They come from `FORGA_PG_BIN` (a folder) or
 * from the `PATH`; in the image `postgresql17-client`. The connection goes through `PG*` variables, so a wrapper
 * script (e.g. `tools/pg-docker/` running the tools in the database container during development) can pass them on.
 */
@Injectable()
export class PgTools {
  constructor(private readonly em: EntityManager) {}

  /** Connection URL of the running server. */
  get url(): URL {
    const clientUrl = this.em.config.get('clientUrl') ?? process.env['DATABASE_URL'];
    if (!clientUrl) throw new BackupError('backup.noDatabaseUrl');
    return new URL(clientUrl);
  }

  /** Name of the database of the server, e.g. `forga`. */
  get database(): string {
    return decodeURIComponent(this.url.pathname.replace(/^\//, '')) || 'postgres';
  }

  private env(database: string): NodeJS.ProcessEnv {
    const url = this.url;
    const ssl = url.searchParams.get('sslmode');
    return {
      ...process.env,
      PGHOST: url.hostname || 'localhost',
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: database,
      ...(ssl ? { PGSSLMODE: ssl } : {}),
    };
  }

  private command(tool: PgTool): string {
    const bin = process.env['FORGA_PG_BIN'];
    return bin ? join(bin, tool) : tool;
  }

  /** Starts a tool; the caller reads stdout and writes stdin. */
  spawn(tool: PgTool, args: string[], database = this.database): ChildProcessWithoutNullStreams {
    return spawn(this.command(tool), args, { env: this.env(database), stdio: ['pipe', 'pipe', 'pipe'] });
  }

  /** Waits for the end of a tool; rejects with `code` and the end of the error output if it fails. */
  static finished(child: ChildProcessWithoutNullStreams, code: string, stderr: OutputTail): Promise<void> {
    return new Promise((resolve, reject) => {
      child.once('error', (error: NodeJS.ErrnoException) => reject(new BackupError(error.code === 'ENOENT' ? 'backup.toolsMissing' : code, error.message)));
      child.once('close', (exit) => (exit === 0 ? resolve() : reject(new BackupError(code, stderr.toString() || `exit code ${exit}`))));
    });
  }

  /** Runs a tool to the end and returns its output. */
  async run(tool: PgTool, args: string[], options: { database?: string; code?: string } = {}): Promise<string> {
    const child = this.spawn(tool, args, options.database);
    const stderr = new OutputTail();
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => stderr.add(chunk));
    child.stdin.end();
    await PgTools.finished(child, options.code ?? 'backup.toolFailed', stderr);
    return stdout;
  }

  /** Runs SQL statements one by one (each outside a transaction, e.g. `CREATE DATABASE`) in another database. */
  async sql(statements: string[], database = 'postgres', code = 'backup.sqlFailed'): Promise<string> {
    return this.run('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...statements.flatMap((s) => ['-c', s])], { database, code });
  }

  /** Version of `pg_dump`, e.g. `17.6`; `null` if the tools are missing. */
  async clientVersion(): Promise<string | null> {
    try {
      const output = await this.run('pg_dump', ['--version']);
      return /(\d+(?:\.\d+)?)/.exec(output)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  /** Version of the database server, e.g. `17.6`. */
  async serverVersion(): Promise<string | null> {
    try {
      const rows = await this.em.fork().getConnection().execute<{ server_version: string }[]>('show server_version');
      return /(\d+(?:\.\d+)?)/.exec(rows[0]?.server_version ?? '')?.[1] ?? null;
    } catch {
      return null;
    }
  }

  /** May the database role create databases (needed to restore into a new database and swap)? */
  async canCreateDatabase(): Promise<boolean> {
    const rows = await this.em.fork().getConnection().execute<{ ok: boolean }[]>('select rolcreatedb or rolsuper as ok from pg_roles where rolname = current_user');
    return Boolean(rows[0]?.ok);
  }
}

/** Major version of a PostgreSQL version string, e.g. `17` of `17.6`. */
export const majorVersion = (version: string | null) => (version ? Number(version.split('.')[0]) : null);
