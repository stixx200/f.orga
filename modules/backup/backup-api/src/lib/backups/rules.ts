import { mkdir, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';
import { BACKUP_EXTENSION, type BackupSchedule } from '@forga/backup-contracts';
import { BackupError } from '../format/backup-format.js';

// ----- Target folder -----

/**
 * The target folder below the root: relative, without `..`, never the root's parent. Throws `backup.pathOutsideRoot`.
 * Symbolic links are checked by `ensureTarget`.
 */
export function resolveTarget(root: string, relative: string): string {
  const value = relative.trim();
  if (!value || value.includes('\0') || isAbsolute(value) || /^[a-zA-Z]:/.test(value)) throw new BackupError('backup.pathOutsideRoot');
  const parts = value.split(/[\\/]+/);
  if (parts.some((part) => part === '..')) throw new BackupError('backup.pathOutsideRoot');
  const target = join(root, normalize(value)).replace(/[\\/]+$/, '');
  const base = normalize(root).replace(/[\\/]+$/, '');
  if (target === base || !target.startsWith(base + sep)) throw new BackupError('backup.pathOutsideRoot');
  return target;
}

/** Creates the target folder if needed and checks that it really lies below the root (also through links). */
export async function ensureTarget(root: string, relative: string): Promise<string> {
  const target = resolveTarget(root, relative);
  const realRoot = await realpath(root).catch(() => {
    throw new BackupError('backup.rootMissing');
  });
  // The deepest existing folder must not lead outside either, before anything is created there.
  let existing = target;
  while (existing.startsWith(root) && !(await stat(existing).catch(() => null))) existing = dirname(existing);
  const realExisting = await realpath(existing).catch(() => realRoot);
  if (realExisting !== realRoot && !realExisting.startsWith(realRoot + sep)) throw new BackupError('backup.pathOutsideRoot');
  let realTarget: string;
  try {
    await mkdir(target, { recursive: true, mode: 0o750 });
    realTarget = await realpath(target);
  } catch (error) {
    throw new BackupError('backup.targetNotWritable', error instanceof Error ? error.message : String(error));
  }
  if (!realTarget.startsWith(realRoot + sep)) throw new BackupError('backup.pathOutsideRoot');
  return realTarget;
}

/** A name of a backup file as uploaded or listed: no folders, no hidden files, our extension. */
export function isBackupFileName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(name) && name.endsWith(BACKUP_EXTENSION);
}

// ----- Time (Europe/Berlin) -----

/** Local date, time and ISO weekday (1 = Monday) in Europe/Berlin. */
export function berlinParts(at: Date): { date: string; time: string; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts['year']}-${parts['month']}-${parts['day']}`,
    time: `${parts['hour']}:${parts['minute']}`,
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts['weekday']) + 1,
  };
}

/** The instant of a local date and time in Europe/Berlin. */
export function berlinTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, h, min);
  let guess = wanted;
  // Two rounds settle the offset also around the change of summer time.
  for (let round = 0; round < 2; round++) {
    const local = berlinParts(new Date(guess));
    const [ly, lm, ld] = local.date.split('-').map(Number);
    const [lh, lmin] = local.time.split(':').map(Number);
    guess += wanted - Date.UTC(ly, lm - 1, ld, lh, lmin);
  }
  return new Date(guess);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const runsOn = (schedule: BackupSchedule, date: string) => schedule.mode === 'daily' || (schedule.mode === 'weekdays' && berlinParts(new Date(`${date}T12:00:00Z`)).weekday <= 5);

/** A scheduled backup that was missed by more than this is skipped (e.g. server off over night). */
const CATCH_UP_MS = 12 * 60 * 60 * 1000;

/** Is a scheduled backup due now? `lastScheduled`: start of the latest scheduled backup (whatever its result). */
export function isDue(now: Date, schedule: BackupSchedule, lastScheduled: Date | null): boolean {
  if (schedule.mode === 'off') return false;
  const today = berlinParts(now).date;
  if (!runsOn(schedule, today)) return false;
  const at = berlinTime(today, schedule.time);
  return now >= at && now.getTime() - at.getTime() < CATCH_UP_MS && (!lastScheduled || lastScheduled < at);
}

/** The next scheduled backup after `now`. */
export function nextScheduled(now: Date, schedule: BackupSchedule, lastScheduled: Date | null): Date | null {
  if (schedule.mode === 'off') return null;
  if (isDue(now, schedule, lastScheduled)) return now;
  const today = berlinParts(now).date;
  for (let day = 0; day < 8; day++) {
    const date = addDays(today, day);
    if (!runsOn(schedule, date)) continue;
    const at = berlinTime(date, schedule.time);
    if (at > now) return at;
  }
  return null;
}

/** File name of a new backup, e.g. `forga-real-2026-10-28_0230.forgabackup`. */
export function backupFileName(instance: string, at: Date): string {
  const local = berlinParts(at);
  const slug = instance.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'forga';
  return `forga-${slug}-${local.date}_${local.time.replace(':', '')}${BACKUP_EXTENSION}`;
}

// ----- Retention -----

export interface RetentionCandidate {
  id: string;
  startedAt: Date;
  /** Kept at least until then (safety backups). */
  keepUntil: Date | null;
}

/**
 * Backups to delete: all except the newest `keepCount`, those of the last `keepDays` days and those whose `keepUntil`
 * has not passed yet.
 */
export function selectForPruning(candidates: readonly RetentionCandidate[], now: Date, keepCount: number, keepDays: number): string[] {
  const limit = now.getTime() - keepDays * 86_400_000;
  return candidates
    .toSorted((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .filter((c, index) => index >= keepCount && c.startedAt.getTime() < limit && !(c.keepUntil && c.keepUntil > now))
    .map((c) => c.id);
}
