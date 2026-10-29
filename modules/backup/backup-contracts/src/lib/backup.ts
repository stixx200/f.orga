import { z } from 'zod';

/** Settings section `backup.general` (read and written through `/api/backup/settings` with `backup.manage`). */
export const BACKUP_SETTINGS_SECTION = 'backup.general';

/** File extension of backups. */
export const BACKUP_EXTENSION = '.forgabackup';
/** Minimum length of the passphrase. */
export const PASSPHRASE_MIN_LENGTH = 12;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const BackupSchedule = z.object({
  /** `off`: only manual backups; `weekdays`: Monday to Friday. */
  mode: z.enum(['off', 'daily', 'weekdays']).default('daily'),
  /** Local time (Europe/Berlin). */
  time: time.default('02:30'),
});
export type BackupSchedule = z.infer<typeof BackupSchedule>;

/** What the administrator sets up; the passphrase itself is stored separately (encrypted). */
export const BackupSettings = z.object({
  /** Folder below `FORGA_BACKUP_ROOT`, relative. */
  targetPath: z.string().trim().min(1).max(200).default('forga'),
  schedule: BackupSchedule.default({ mode: 'daily', time: '02:30' }),
  /** The newest n backups are kept. */
  keepCount: z.number().int().min(1).max(1000).default(14),
  /** All backups of the last d days are kept. */
  keepDays: z.number().int().min(0).max(3650).default(30),
  /** Verify every backup right after creating it (decrypt and read the contents). */
  verifyAfterBackup: z.boolean().default(true),
  encryption: z.boolean().default(true),
  include: z.object({ plugins: z.boolean().default(true), settingsCopy: z.boolean().default(true) }).default({ plugins: true, settingsCopy: true }),
  notify: z
    .object({
      /** Task for `backup.manage` and e-mail to `backup.notify` when a backup fails. */
      onFailure: z.boolean().default(true),
      /** Warning (overview and task) when there is no successful backup for this many hours. */
      staleHours: z.number().int().min(1).max(24 * 30).default(36),
    })
    .default({ onFailure: true, staleHours: 36 }),
});
export type BackupSettings = z.infer<typeof BackupSettings>;

/** The settings as the page shows them: never the passphrase, only whether one is stored and its fingerprint. */
export const BackupSettingsView = BackupSettings.extend({
  passphraseSet: z.boolean(),
  /** Fingerprint of the stored passphrase, e.g. `3F9AC21B`. */
  passphraseId: z.string().nullable(),
  /** The stored passphrase cannot be decrypted (`FORGA_SECRET_KEY` missing or changed). */
  passphraseUnreadable: z.boolean(),
});
export type BackupSettingsView = z.infer<typeof BackupSettingsView>;

/**
 * Saving the settings. A new passphrase is entered twice and needs the confirmation that it is kept safely; without
 * one the stored passphrase stays. Switching encryption off needs an explicit confirmation.
 */
export const BackupSettingsInput = BackupSettings.extend({
  passphrase: z.string().min(PASSPHRASE_MIN_LENGTH).max(500).optional(),
  passphraseRepeat: z.string().max(500).optional(),
  passphraseKeptSafe: z.boolean().default(false),
  unencryptedConfirmed: z.boolean().default(false),
});
export type BackupSettingsInput = z.input<typeof BackupSettingsInput>;

/** Result of „Ziel prüfen“. */
export const TargetCheck = z.object({
  /** Absolute folder in the container, e.g. `/backups/forga`. */
  path: z.string(),
  writable: z.boolean(),
  freeBytes: z.number().nullable(),
  /** Error code when not writable, e.g. `backup.targetNotWritable`. */
  error: z.string().nullable(),
  checkedAt: z.string(),
});
export type TargetCheck = z.infer<typeof TargetCheck>;

export const BackupTrigger = z.enum(['scheduled', 'manual', 'safety', 'upload', 'foreign']);
export type BackupTrigger = z.infer<typeof BackupTrigger>;

/** `missing`: known backup whose file is gone; `deleted`: deleted by retention or by hand (kept as record). */
export const BackupStatusValue = z.enum(['running', 'ok', 'failed', 'missing', 'deleted']);
export type BackupStatusValue = z.infer<typeof BackupStatusValue>;

/** Row counts of central tables, to compare a backup with the current state. */
export const BackupCounts = z.object({
  persons: z.number().nullable(),
  incidents: z.number().nullable(),
  reports: z.number().nullable(),
  sessions: z.number().nullable(),
});
export type BackupCounts = z.infer<typeof BackupCounts>;

/** Contents of `manifest.json` inside a backup. */
export const BackupManifest = z.object({
  format: z.literal(1),
  appVersion: z.string(),
  instance: z.string(),
  instanceId: z.string(),
  createdAt: z.string(),
  trigger: BackupTrigger,
  modules: z.array(z.object({ id: z.string(), version: z.string(), plugin: z.boolean().default(false) })),
  /** Executed migrations (names), to refuse backups of a version this server does not know. */
  migrations: z.array(z.string()),
  postgres: z.object({ server: z.string().nullable(), dump: z.string().nullable() }),
  counts: BackupCounts,
  includes: z.object({ plugins: z.boolean(), settings: z.boolean() }),
});
export type BackupManifest = z.infer<typeof BackupManifest>;

/** Result of „Prüfen“ (and of „Wiederherstellung testen“). */
export const Verification = z.object({
  ok: z.boolean(),
  checkedAt: z.string(),
  /** Error code when not ok, e.g. `backup.wrongPassphrase`, `backup.corrupt`. */
  error: z.string().nullable(),
  /** Objects in the database dump (`pg_restore --list`) and schemas. */
  objects: z.number().nullable(),
  schemas: z.number().nullable(),
  /** All modules of the backup exist here and the version is not newer. */
  compatible: z.boolean().nullable(),
  missingModules: z.array(z.string()),
  restoreTested: z.boolean(),
  /** Counts after the restore test; equal to the manifest when the test succeeded. */
  restoredCounts: BackupCounts.nullable(),
});
export type Verification = z.infer<typeof Verification>;

/** A backup in the list: a record of f.orga, a file in the target folder, or both. */
export const BackupEntry = z.object({
  id: z.uuid(),
  fileName: z.string().nullable(),
  trigger: BackupTrigger,
  userName: z.string().nullable(),
  startedAt: z.string(),
  durationMs: z.number().nullable(),
  size: z.number().nullable(),
  status: BackupStatusValue,
  errorCode: z.string().nullable(),
  encrypted: z.boolean().nullable(),
  /** Fingerprint of the passphrase the backup needs. */
  passphraseId: z.string().nullable(),
  instance: z.string().nullable(),
  appVersion: z.string().nullable(),
  /** Kept at least until then (safety backups before a restore). */
  keepUntil: z.string().nullable(),
  verification: Verification.nullable(),
});
export type BackupEntry = z.infer<typeof BackupEntry>;

/** Warnings on the overview; codes translated by the module. */
export const BackupWarning = z.enum([
  'backup.notConfigured',
  'backup.noSecretKey',
  'backup.noPassphrase',
  'backup.passphraseUnreadable',
  'backup.unencrypted',
  'backup.stale',
  'backup.lastFailed',
  'backup.targetNotWritable',
  'backup.clientMismatch',
  'backup.toolsMissing',
]);
export type BackupWarning = z.infer<typeof BackupWarning>;

export const BackupOverview = z.object({
  /** `FORGA_BACKUP_ROOT` is set. */
  configured: z.boolean(),
  /** The settings have been saved once (the backup is set up); before, no warnings, tasks or e-mails. */
  settingsSaved: z.boolean(),
  root: z.string().nullable(),
  settings: BackupSettingsView,
  target: TargetCheck.nullable(),
  lastSuccess: BackupEntry.nullable(),
  /** Next scheduled backup (ISO); `null` without schedule. */
  nextScheduled: z.string().nullable(),
  backups: z.number(),
  oldest: z.string().nullable(),
  warnings: z.array(BackupWarning),
  tools: z.object({ pgDump: z.string().nullable(), server: z.string().nullable() }),
  /** `swap`: restore into a new database and swap (needs CREATEDB); `clean`: into the running database. */
  restoreMethod: z.enum(['swap', 'clean']),
  running: z.boolean(),
  /** Latest events: backups, verifications, restores. */
  events: z.array(z.object({ at: z.string(), kind: z.enum(['created', 'failed', 'verified', 'verifyFailed', 'restoreTested', 'restored', 'restoreFailed']), entry: BackupEntry.nullable(), userName: z.string().nullable(), detail: z.string().nullable() })),
  /** Databases kept after a restore (`<db>_before_<time>`), deleted after 7 days. */
  oldDatabases: z.array(z.string()),
});
export type BackupOverview = z.infer<typeof BackupOverview>;

export const BackupNowInput = z.object({ verify: z.boolean().default(true) });
export type BackupNowInput = z.input<typeof BackupNowInput>;

/** „Prüfen“: with the stored passphrase, or with the one entered (foreign backups, restore wizard). */
export const VerifyInput = z.object({ passphrase: z.string().max(500).optional(), restoreTest: z.boolean().default(false) });
export type VerifyInput = z.input<typeof VerifyInput>;

/** Step „Prüfen“ of the restore wizard: the passphrase entered again, never the stored one. */
export const RestoreCheckInput = z.object({ backupId: z.uuid(), passphrase: z.string().max(500).default('') });
export type RestoreCheckInput = z.input<typeof RestoreCheckInput>;

export const RestoreCheck = z.object({
  entry: BackupEntry,
  manifest: BackupManifest,
  verification: Verification,
  /** Counts now and in the backup. */
  current: BackupCounts,
  runningVersion: z.string(),
  brigadeName: z.string().nullable(),
  restoreMethod: z.enum(['swap', 'clean']),
});
export type RestoreCheck = z.infer<typeof RestoreCheck>;

export const RestoreInput = RestoreCheckInput.extend({
  /** Name of the brigade, typed as confirmation. */
  confirmName: z.string().max(300),
  usersInformed: z.literal(true),
});
export type RestoreInput = z.input<typeof RestoreInput>;

export const RestoreStep = z.enum(['maintenance', 'safetyBackup', 'restore', 'swap', 'plugins', 'restart']);
export type RestoreStep = z.infer<typeof RestoreStep>;

export const RestorePhase = z.enum(['running', 'restarting', 'done', 'failed', 'swapFailed']);
export type RestorePhase = z.infer<typeof RestorePhase>;

export const RestoreProgress = z.object({
  phase: RestorePhase,
  steps: z.array(z.object({ step: RestoreStep, state: z.enum(['waiting', 'running', 'done', 'failed']), detail: z.string().nullable() })),
  backupCreatedAt: z.string().nullable(),
  startedAt: z.string(),
  error: z.string().nullable(),
  /** Error output of the tool (shortened), e.g. of `pg_restore`. */
  errorDetail: z.string().nullable(),
  /** Commands for the console when swapping the databases failed. */
  consoleCommands: z.string().nullable(),
});
export type RestoreProgress = z.infer<typeof RestoreProgress>;

/** Answer of `POST /api/backup/restore`: the token for the status (it outlives the restart). */
export const RestoreStarted = z.object({ token: z.string() });
export type RestoreStarted = z.infer<typeof RestoreStarted>;

/** Groups the fingerprint of a passphrase for display, e.g. `3F9A·C21B`. */
export function formatPassphraseId(id: string | null): string {
  return id ? `${id.slice(0, 4)}·${id.slice(4)}` : '–';
}
