import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { Injectable, Logger, type NestMiddleware, type OnModuleInit } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { RestoreProgress } from '@forga/backup-contracts';
import { backupEnvironment } from '../runtime/environment.js';

/** State of a restore, kept in the maintenance file so it survives the restart. */
export interface RestoreState extends RestoreProgress {
  restoreId: string;
  /** SHA-256 of the status token handed to the page that started the restore. */
  tokenHash: string;
  runId: string | null;
  fileName: string;
  safetyFileName: string | null;
  userId: string | null;
  userName: string | null;
  method: 'swap' | 'clean';
  previousDatabase: string | null;
  /** Test system: reason for restoring real data; `null` otherwise. Older state files lack it. */
  realDataReason?: string | null;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Seconds a client should wait before asking again during the maintenance. */
const RETRY_AFTER = 15;
const STATUS_PATH = /^\/api\/backup\/restore\/status(?:\?|$)/;

/**
 * Maintenance mode during a restore: a flag in the process and the file `FORGA_MAINTENANCE_FILE` (default
 * `/tmp/forga-maintenance`) with the state of the restore. While it is on, every API request except the status of the
 * restore answers `503 maintenance`. The file survives the restart of the container; after the restart the module
 * finishes the restore (see `RestoreService`) and removes it. The result stays in `<file>.result` for the status page.
 */
@Injectable()
export class Maintenance implements OnModuleInit {
  private readonly logger = new Logger(Maintenance.name);
  private state: RestoreState | null = null;
  private inFlight = 0;

  onModuleInit(): void {
    this.state = this.readFile(this.file);
  }

  get file(): string {
    return backupEnvironment.maintenanceFile();
  }

  private get resultFile(): string {
    return `${this.file}.result`;
  }

  private readFile(path: string): RestoreState | null {
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as RestoreState;
    } catch (error) {
      this.logger.error(`Maintenance file ${path} not readable`, error instanceof Error ? error.stack : String(error));
      return null;
    }
  }

  /** The state of a running (or, after the restart, unfinished) restore. */
  get current(): RestoreState | null {
    return this.state;
  }

  /** The maintenance mode is on (requests answer 503). */
  get active(): boolean {
    return this.state !== null && this.state.phase !== 'done' && this.state.phase !== 'failed' && this.state.steps.some((s) => s.step === 'maintenance' && s.state !== 'waiting');
  }

  /** Records a new or changed state (in memory and in the file, written atomically). */
  save(state: RestoreState): void {
    this.state = state;
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    renameSync(temporary, this.file);
  }

  /** Ends the maintenance mode; the final state stays readable for the status page. */
  finish(state: RestoreState): void {
    this.state = null;
    writeFileSync(this.resultFile, JSON.stringify(state), { mode: 0o600 });
    rmSync(this.file, { force: true });
  }

  /** Progress for the holder of the token: of the running restore or of the last finished one. */
  progress(token: string): RestoreProgress | null {
    const hash = Buffer.from(hashToken(token));
    for (const state of [this.state, this.readFile(this.resultFile)]) {
      if (!state) continue;
      const expected = Buffer.from(state.tokenHash);
      if (expected.length === hash.length && timingSafeEqual(expected, hash)) {
        const { phase, steps, backupCreatedAt, startedAt, error, errorDetail, consoleCommands } = state;
        return { phase, steps, backupCreatedAt, startedAt, error, errorDetail, consoleCommands };
      }
    }
    return null;
  }

  /** Waits until no other request is running, at most `timeoutMs`. */
  async drain(timeoutMs = 30_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (this.inFlight > 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /** Counts running requests and refuses new ones during the maintenance. */
  handle(req: Request, res: Response, next: NextFunction): void {
    if (!req.originalUrl.startsWith('/api/')) return next();
    if (this.active && !(req.method === 'GET' && STATUS_PATH.test(req.originalUrl))) {
      res.setHeader('Retry-After', String(RETRY_AFTER));
      res.status(503).json({ code: 'maintenance', retryAfter: RETRY_AFTER });
      return;
    }
    this.inFlight++;
    let done = false;
    const end = () => {
      if (!done) {
        done = true;
        this.inFlight--;
      }
    };
    res.once('finish', end);
    res.once('close', end);
    next();
  }
}

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly maintenance: Maintenance) {}

  use(req: Request, res: Response, next: NextFunction): void {
    this.maintenance.handle(req, res, next);
  }
}
