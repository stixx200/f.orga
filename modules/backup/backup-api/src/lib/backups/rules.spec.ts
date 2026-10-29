import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackupError } from '../format/backup-format.js';
import { backupFileName, berlinTime, ensureTarget, isBackupFileName, isDue, nextScheduled, resolveTarget, selectForPruning } from './rules.js';

const code = (fn: () => unknown) => {
  try {
    fn();
    return 'none';
  } catch (error) {
    return error instanceof BackupError ? error.code : String(error);
  }
};

describe('target folder', () => {
  it('accepts folders below the root only', () => {
    expect(resolveTarget('/backups', 'forga')).toBe('/backups/forga');
    expect(resolveTarget('/backups/', 'real/daily')).toBe('/backups/real/daily');
    for (const bad of ['', ' ', '..', '../etc', 'a/../../etc', '/etc', 'C:\\temp', '.', './', 'a/..']) {
      expect(code(() => resolveTarget('/backups', bad))).toBe('backup.pathOutsideRoot');
    }
  });

  it('refuses links pointing outside the root', async () => {
    const base = mkdtempSync(join(tmpdir(), 'forga-backup-root-'));
    try {
      const root = join(base, 'root');
      mkdirSync(root);
      mkdirSync(join(base, 'outside'));
      symlinkSync(join(base, 'outside'), join(root, 'escape'));
      await expect(ensureTarget(root, 'escape')).rejects.toMatchObject({ code: 'backup.pathOutsideRoot' });
      await expect(ensureTarget(root, 'escape/deeper')).rejects.toMatchObject({ code: 'backup.pathOutsideRoot' });
      expect(await ensureTarget(root, 'forga/real')).toMatch(/root\/forga\/real$/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('accepts only plain backup file names', () => {
    expect(isBackupFileName('forga-real-2026-10-28_0230.forgabackup')).toBe(true);
    for (const bad of ['../x.forgabackup', '.hidden.forgabackup', 'a/b.forgabackup', 'dump.sql', 'x.forgabackup.part']) expect(isBackupFileName(bad)).toBe(false);
  });
});

describe('schedule', () => {
  const daily = { mode: 'daily' as const, time: '02:30' };

  it('converts Berlin local time, also in summer time', () => {
    expect(berlinTime('2026-01-15', '02:30').toISOString()).toBe('2026-01-15T01:30:00.000Z');
    expect(berlinTime('2026-07-15', '02:30').toISOString()).toBe('2026-07-15T00:30:00.000Z');
  });

  it('is due once per day after the time', () => {
    const at = new Date('2026-01-15T01:30:00.000Z');
    expect(isDue(new Date('2026-01-15T01:29:00Z'), daily, null)).toBe(false);
    expect(isDue(new Date('2026-01-15T01:31:00Z'), daily, null)).toBe(true);
    expect(isDue(new Date('2026-01-15T01:45:00Z'), daily, at)).toBe(false);
    expect(isDue(new Date('2026-01-15T01:45:00Z'), daily, new Date('2026-01-14T01:30:00Z'))).toBe(true);
    // Missed by more than 12 hours: wait for the next day.
    expect(isDue(new Date('2026-01-15T14:00:00Z'), daily, null)).toBe(false);
    expect(isDue(new Date('2026-01-15T01:31:00Z'), { mode: 'off', time: '02:30' }, null)).toBe(false);
  });

  it('skips weekends with the weekday schedule', () => {
    const weekdays = { mode: 'weekdays' as const, time: '02:30' };
    // 2026-01-17 is a Saturday.
    expect(isDue(new Date('2026-01-17T01:31:00Z'), weekdays, null)).toBe(false);
    expect(nextScheduled(new Date('2026-01-17T01:31:00Z'), weekdays, null)?.toISOString()).toBe('2026-01-19T01:30:00.000Z');
    expect(nextScheduled(new Date('2026-01-15T01:45:00Z'), daily, new Date('2026-01-15T01:30:00Z'))?.toISOString()).toBe('2026-01-16T01:30:00.000Z');
  });

  it('names files by instance and local time', () => {
    expect(backupFileName('Real', new Date('2026-07-15T00:30:00Z'))).toBe('forga-real-2026-07-15_0230.forgabackup');
  });
});

describe('retention', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it('keeps the newest n and all of the last d days', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, startedAt: day(i * 2), keepUntil: null }));
    // Newest 3 (0, 2, 4 days old) and all younger than 7 days (also 6 days old) stay.
    expect(selectForPruning(candidates, now, 3, 7)).toEqual(['b4', 'b5', 'b6', 'b7', 'b8', 'b9']);
    expect(selectForPruning(candidates, now, 10, 0)).toEqual([]);
    expect(selectForPruning(candidates, now, 1, 0)).toHaveLength(9);
  });

  it('keeps safety backups until their date', () => {
    const candidates = [
      { id: 'new', startedAt: day(1), keepUntil: null },
      { id: 'safety', startedAt: day(20), keepUntil: day(-10) },
      { id: 'expired', startedAt: day(40), keepUntil: day(10) },
    ];
    expect(selectForPruning(candidates, now, 1, 7)).toEqual(['expired']);
  });
});
