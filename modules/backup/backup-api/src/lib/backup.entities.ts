import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { BackupManifest, BackupStatusValue, BackupTrigger, RestoreProgress, Verification } from '@forga/backup-contracts';

/**
 * A backup: created by f.orga (scheduled, manual, safety backup before a restore), uploaded, or found in the target
 * folder (foreign). A protocol, therefore not historized; creating, deleting and restoring are in the audit log.
 */
export const BackupRunSchema = defineEntity({
  name: 'BackupRun',
  schema: 'backup',
  tableName: 'run',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** File name in the target folder; `null` if the backup failed before the file existed. */
    fileName: p.string().nullable().index(),
    /** Target folder (relative to `FORGA_BACKUP_ROOT`) at the time of the backup. */
    targetPath: p.string().nullable(),
    trigger: p.string().$type<BackupTrigger>(),
    userId: p.string().nullable(),
    userName: p.string().nullable(),
    startedAt: p.datetime().index(),
    finishedAt: p.datetime().nullable(),
    size: p.bigint('number').nullable(),
    status: p.string().$type<BackupStatusValue>(),
    errorCode: p.string().nullable(),
    errorDetail: p.text().nullable(),
    encrypted: p.boolean().nullable(),
    passphraseId: p.string().nullable(),
    instance: p.string().nullable(),
    appVersion: p.string().nullable(),
    manifest: p.json<BackupManifest>().nullable(),
    verification: p.json<Verification>().nullable(),
    /** Kept at least until then (safety backups). */
    keepUntil: p.datetime().nullable(),
    /** Deleted by hand or by the retention; the record follows the retention category `backup.run-log`. */
    deletedAt: p.datetime().nullable(),
  },
});
export class BackupRun extends BackupRunSchema.class {}
BackupRunSchema.setClass(BackupRun);

/** A restore with its steps and result (written in the old database before, and in the new one after the restart). */
export const BackupRestoreSchema = defineEntity({
  name: 'BackupRestore',
  schema: 'backup',
  tableName: 'restore',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** The restored backup (in the database it came from). */
    runId: p.string().nullable(),
    fileName: p.string(),
    backupCreatedAt: p.datetime().nullable(),
    safetyFileName: p.string().nullable(),
    userId: p.string().nullable(),
    userName: p.string().nullable(),
    startedAt: p.datetime(),
    finishedAt: p.datetime().nullable(),
    /** `swap` (new database) or `clean` (into the running database). */
    method: p.string(),
    phase: p.string().$type<RestoreProgress['phase']>(),
    steps: p.json<RestoreProgress['steps']>(),
    errorCode: p.string().nullable(),
    errorDetail: p.text().nullable(),
    /** The previous database, kept for 7 days. */
    previousDatabase: p.string().nullable(),
    /** Test system: why a backup of the real system was restored (real data in the test system). */
    realDataReason: p.text().nullable(),
    /** Test system with real data: all data is deleted on this day (7 days after the restore). */
    realDataUntil: p.datetime().nullable(),
  },
});
export class BackupRestore extends BackupRestoreSchema.class {}
BackupRestoreSchema.setClass(BackupRestore);
